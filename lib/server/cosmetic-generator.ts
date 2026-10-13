import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { ApiError, db, now, uid } from './core';

export type GeneratedKind = 'pin' | 'frame';
export type GeneratedRarity = 'common' | 'legendary';
type Variant = { anime: string; kind: GeneratedKind; rarity: GeneratedRarity; idea: string };

const ideas: Record<string, Record<GeneratedRarity, string>> = {
  'one piece': { common: 'соломенная шляпа Луффи', legendary: 'пиратский череп команды Мугивар, золотой штурвал и морские волны' },
  'ван пис': { common: 'соломенная шляпа Луффи', legendary: 'пиратский череп команды Мугивар, золотой штурвал и морские волны' },
  bleach: { common: 'значок шинигами и цуба дзанпакто', legendary: 'маска Пустого и духовная энергия банкая' },
  'блич': { common: 'значок шинигами и цуба дзанпакто', legendary: 'маска Пустого и духовная энергия банкая' },
  'black clover': { common: 'магический гримуар с четырёхлистным клевером', legendary: 'пятилистный чёрный клевер и демонический меч' },
  'чёрный клевер': { common: 'магический гримуар с четырёхлистным клевером', legendary: 'пятилистный чёрный клевер и демонический меч' },
  naruto: { common: 'миска рамена Ичираку с нарутомаки', legendary: 'символ Курамы и девять хвостов чакры' },
  'наруто': { common: 'миска рамена Ичираку с нарутомаки', legendary: 'символ Курамы и девять хвостов чакры' },
};

export function generationConcept(anime: string, rarity: GeneratedRarity, override = '') {
  if (override.trim()) return override.trim();
  return ideas[anime.trim().toLocaleLowerCase('ru-RU')]?.[rarity] ||
    (rarity === 'common'
      ? `самый узнаваемый небольшой предмет или эмблема из «${anime}»; один простой символ`
      : `другой узнаваемый символ из «${anime}», отличающийся от обычного предмета: легендарная сила, артефакт или форма`);
}

export function generationPrompt({ anime, kind, rarity, idea }: Variant) {
  const geometry = kind === 'pin'
    ? 'A single centered collectible pin, one immediately readable silhouette, no scenery, no backing card or background. Keep details readable at 48 pixels.'
    : 'A perfectly circular avatar frame viewed straight on, symmetrical base ring, large completely empty transparent circular center for a human face. Keep all decoration outside the inner circle. Nothing crosses the center. Thin ring for common rarity; ornate but controlled ring for legendary rarity.';
  const level = rarity === 'common'
    ? 'Common rarity: restrained materials, minimal composition, clean contour, limited particles, no strong glow.'
    : 'Legendary rarity: distinct subject and meaning, premium metal and gemstones when appropriate, magical energy and a few particles, intricate but readable composition.';
  return `Create a production quality AniMonster profile cosmetic inspired by the anime "${anime}". Main motif: ${idea}. ${geometry} ${level} True hand-designed pixel art: crisp square pixel clusters, consistent pixel grid and outline thickness, deliberate limited palette, saturated harmonious colors. Match the visual language of the attached AniMonster reference artwork; do not copy its subject. Transparent background, isolated asset, no text, no watermark, no characters or faces, no photorealism, no smooth vector gradients, no blurred edges. Output one square asset.`;
}

async function checkedReference(file: File | null) {
  if (!file || file.size === 0) return null;
  if (file.size > 5_000_000) throw new ApiError('Референс должен быть меньше 5 МБ', 413);
  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    const meta = await sharp(bytes, { limitInputPixels: 16_000_000 }).metadata();
    if (!['png', 'jpeg', 'webp'].includes(meta.format || '') || (meta.pages || 1) > 1) throw new Error('unsupported');
    return await sharp(bytes).resize(1024, 1024, { fit: 'inside' }).png().toBuffer();
  } catch { throw new ApiError('Референс должен быть PNG, JPG или WebP', 400); }
}

async function callProvider(prompt: string, kind: GeneratedKind, rarity: GeneratedRarity, reference: Buffer | null) {
  const provider = process.env.COSMETIC_IMAGE_PROVIDER || 'openai';
  const key = process.env.COSMETIC_IMAGE_API_KEY || process.env.OPENAI_API_KEY;
  if (provider !== 'openai') throw new ApiError('Неизвестный провайдер генерации', 503);
  if (!key) throw new ApiError('Генератор не настроен: задайте COSMETIC_IMAGE_API_KEY на сервере', 503);
  const model = process.env.COSMETIC_IMAGE_MODEL || 'gpt-image-1.5';
  if (!/^gpt-image-[a-zA-Z0-9.-]+$/.test(model)) throw new ApiError('Некорректная модель генерации', 503);
  const form = new FormData();
  form.set('model', model);
  form.set('prompt', prompt);
  form.set('size', '1024x1024');
  form.set('quality', 'high');
  form.set('background', 'transparent');
  form.set('output_format', 'png');
  const stylePath = path.join(process.cwd(), 'public', 'rewards', 'generator-reference', `${kind}-${rarity}.png`);
  const style = await readFile(stylePath);
  form.append('image[]', new File([new Uint8Array(style)], 'animonster-style.png', { type: 'image/png' }));
  if (reference) form.append('image[]', new File([new Uint8Array(reference)], 'user-reference.png', { type: 'image/png' }));
  const response = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form,
    signal: AbortSignal.timeout(180_000), cache: 'no-store',
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new ApiError(`Сервис изображений: ${detail?.error?.message?.slice(0, 220) || `HTTP ${response.status}`}`, 502);
  }
  const result = await response.json() as { data?: Array<{ b64_json?: string }> };
  const encoded = result.data?.[0]?.b64_json;
  if (!encoded || encoded.length > 30_000_000) throw new ApiError('Сервис не вернул допустимое изображение', 502);
  return { bytes: Buffer.from(encoded, 'base64'), model };
}

// Remove only border-connected flat background. Interior dark pixels remain intact.
async function removeFlatBackground(input: Buffer) {
  const { data, info } = await sharp(input, { limitInputPixels: 16_000_000 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const alpha = 3, n = width * height;
  let transparentPixels = 0;
  for (let i = 0; i < n; i++) if (data[i * 4 + alpha] < 250) transparentPixels++;
  if (transparentPixels > n * .05) return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const corners = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]];
  const base = corners.map(([x, y]) => Array.from(data.subarray((y * width + x) * 4, (y * width + x) * 4 + 3)));
  const visited = new Uint8Array(n), queue = new Int32Array(n);
  let head = 0, tail = 0;
  const similar = (p: number) => base.some((c) => Math.max(...c.map((v, i) => Math.abs(v - data[p * 4 + i]))) <= 26);
  for (let x = 0; x < width; x++) for (const p of [x, (height - 1) * width + x]) if (!visited[p] && similar(p)) { visited[p] = 1; queue[tail++] = p; }
  for (let y = 0; y < height; y++) for (const p of [y * width, y * width + width - 1]) if (!visited[p] && similar(p)) { visited[p] = 1; queue[tail++] = p; }
  while (head < tail) {
    const p = queue[head++], x = p % width;
    for (const q of [x ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p >= width ? p - width : -1, p < n - width ? p + width : -1])
      if (q >= 0 && !visited[q] && similar(q)) { visited[q] = 1; queue[tail++] = q; }
  }
  if (tail < n * .05) throw new ApiError('Модель не создала прозрачный фон. Повторите генерацию.', 502);
  for (let p = 0; p < n; p++) if (visited[p]) data[p * 4 + alpha] = 0;
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

export async function prepareGeneratedImage(input: Buffer, kind: GeneratedKind) {
  if (input.length > 18_000_000) throw new ApiError('Ответ модели слишком большой', 502);
  const clean = await removeFlatBackground(input);
  const size = kind === 'pin' ? 512 : 1024;
  const image = await sharp(clean).resize(size, size, { fit: 'contain', kernel: 'nearest', background: '#00000000' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgba = image.data;
  if (kind === 'frame') {
    const radius = size * .335;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (Math.hypot(x + .5 - size / 2, y + .5 - size / 2) < radius) rgba[(y * size + x) * 4 + 3] = 0;
  }
  let opaque = 0, clear = 0;
  for (let p = 0; p < size * size; p++) { if (rgba[p * 4 + 3] > 30) opaque++; else clear++; }
  if (opaque < size * size * (kind === 'pin' ? .02 : .025) || clear < size * size * .15)
    throw new ApiError('Изображение не прошло проверку прозрачности. Повторите генерацию.', 502);
  if (kind === 'frame') {
    const sectors = Array(16).fill(0) as number[];
    for (let y = 0; y < size; y += 4) for (let x = 0; x < size; x += 4) {
      const dx = x - size / 2, dy = y - size / 2, radius = Math.hypot(dx, dy);
      if (radius >= size * .34 && radius <= size * .49 && rgba[(y * size + x) * 4 + 3] > 30)
        sectors[Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * 16) % 16]++;
    }
    if (sectors.some((count) => count < 20)) throw new ApiError('Рамка не образует полный круг. Повторите генерацию.', 502);
  }
  const full = await sharp(rgba, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer();
  const thumb = await sharp(full).resize(128, 128, { kernel: 'nearest' }).png().toBuffer();
  return { full, thumb };
}

export async function generateCosmetic(actor: string, input: FormData) {
  const anime = String(input.get('anime') || '').trim(), kind = String(input.get('kind')) as GeneratedKind;
  const rarity = String(input.get('rarity')) as GeneratedRarity, override = String(input.get('idea') || '').trim();
  if (anime.length < 2 || anime.length > 100 || !['pin', 'frame'].includes(kind) || !['common', 'legendary'].includes(rarity) || override.length > 300)
    throw new ApiError('Проверьте название аниме, тип, редкость и описание');
  const file = input.get('reference');
  const reference = await checkedReference(file instanceof File ? file : null);
  const concept = generationConcept(anime, rarity, override);
  const prompt = generationPrompt({ anime, kind, rarity, idea: concept });
  const { bytes, model } = await callProvider(prompt, kind, rarity, reference);
  const { full, thumb } = await prepareGeneratedImage(bytes, kind);
  const id = uid(), batch = String(input.get('batch') || '');
  await db().prepare(`INSERT INTO cosmetic_generations(id,batch_id,actor_id,anime,kind,rarity,concept,prompt,model,full_png,thumb_png,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, /^[a-f0-9-]{36}$/.test(batch) ? batch : uid(), actor, anime, kind, rarity, concept, prompt, model, full, thumb, now()).run();
  return { id, concept };
}

export async function publishCosmetic(actor: string, id: string) {
  return db().transaction(async (tx) => {
    const row = await tx.prepare('SELECT id,anime,kind,rarity,concept,status FROM cosmetic_generations WHERE id=? FOR UPDATE').bind(id)
      .first<{ id: string; anime: string; kind: GeneratedKind; rarity: GeneratedRarity; concept: string; status: string }>();
    if (!row) throw new ApiError('Генерация не найдена', 404);
    if (row.status === 'published') return { id, cosmeticId: `${row.kind}:generator-${id}`, alreadyPublished: true };
    const cosmeticId = `${row.kind}:generator-${id}`;
    await tx.prepare(`INSERT INTO cosmetics(id,kind,slug,name,description,rarity,image,access_type,active,created_at)
      VALUES (?,?,?,?,?,? ,?,'admin',1,?)`).bind(cosmeticId, row.kind, `generator-${id}`, `${row.anime} · ${row.concept}`.slice(0, 100), 'Создано в AniMonster · выдается администратором', row.rarity, `/api/cosmetic-generator/assets/${id}`, now()).run();
    await tx.prepare("UPDATE cosmetic_generations SET status='published',cosmetic_id=?,published_at=? WHERE id=? AND status='draft'").bind(cosmeticId, now(), id).run();
    return { id, cosmeticId };
  });
}

export async function grantGeneratedCosmetic(actor: string, id: string, userId: string) {
  if (!userId.trim()) throw new ApiError('Укажите ID пользователя');
  return db().transaction(async (tx) => {
    const item = await tx.prepare("SELECT cosmetic_id FROM cosmetic_generations WHERE id=? AND status='published'").bind(id).first<{ cosmetic_id: string }>();
    if (!item) throw new ApiError('Сначала опубликуйте предмет', 409);
    const user = await tx.prepare('SELECT id FROM users WHERE id=?').bind(userId).first();
    if (!user) throw new ApiError('Пользователь не найден', 404);
    await tx.prepare(`INSERT INTO user_cosmetics(user_id,cosmetic_id,unlocked_at,source,source_key,metadata)
      VALUES (?,?,?,'admin',?,?::jsonb) ON CONFLICT(user_id,cosmetic_id) DO NOTHING`)
      .bind(userId, item.cosmetic_id, now(), `generator:${id}`, JSON.stringify({ admin_actor_id: actor, generation_id: id })).run();
    return { ok: true };
  });
}
