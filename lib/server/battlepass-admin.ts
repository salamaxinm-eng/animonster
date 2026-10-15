import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { ApiError, db, now, uid } from './core';
import { PASS_TASKS, seasonDates } from '../battlepass';
import { assertLive, findSeason, memberLock, claimInTransaction, eligiblePassGenres, type PassSeason, type PassReward } from './battlepass';
import { paymentFetch, verifyPayment } from './billing';
type Tx = ReturnType<typeof db>;
const kinds = ['pin', 'tag', 'frame', 'background'];
const finalIds = ['pin:pass-oni', 'tag:pass-oni', 'frame:pass-oni', 'background:pass-oni'];
async function audit(tx: Tx, actor: string, season: string | null, action: string, reason: string, detail: unknown, target: string | null = null) {
  await tx.prepare('INSERT INTO pass_audit(id,actor_id,season_id,target_user_id,action,reason,detail,created_at) VALUES (?,?,?,?,?,?,?::text::jsonb,?)').bind(uid(), actor, season, target, action, reason, JSON.stringify(detail), now()).run();
}
async function draft(tx: Tx, id: string) {
  const s = await tx.prepare('SELECT * FROM pass_seasons WHERE id=? FOR UPDATE').bind(id).first<PassSeason>();
  if (!s || s.status !== 'draft') throw new ApiError('Изменять можно только черновик сезона', 409);
  return s;
}
export async function savePassDraft(actor: string, input: Record<string, unknown>) {
  const id = String(input.id || ''), title = String(input.title || '').trim(), zone = String(input.timezone || 'Europe/Moscow');
  const price = Number(input.price);
  if (!/^[a-z0-9-]{3,70}$/.test(id) || !title || title.length > 100 || !Number.isInteger(price) || price < 1 || price > 100000) throw new ApiError('Проверьте название, идентификатор и цену');
  let dates;
  try { dates = seasonDates(String(input.day), zone); } catch { throw new ApiError('Проверьте дату и часовую зону IANA'); }
  const tasks = (input.tasks || PASS_TASKS) as typeof PASS_TASKS;
  for (const group of ['daily','weekly','seasonal'] as const) {
    if (!Array.isArray(tasks[group]) || tasks[group].length !== PASS_TASKS[group].length) throw new ApiError('Неверный комплект заданий');
    for (const [i, t] of tasks[group].entries()) if (t.id !== PASS_TASKS[group][i].id || t.metric !== PASS_TASKS[group][i].metric || !Number.isInteger(t.target) || t.target < 1 || t.target > 1000000 || !Number.isInteger(t.xp) || t.xp < 1 || t.xp > 2000 || typeof t.title !== 'string' || t.title.length > 120) throw new ApiError('Неверные параметры задания');
  }
  if (id === 'oni-awakening' && (price !== 1499 || JSON.stringify(tasks) !== JSON.stringify(PASS_TASKS))) throw new ApiError('Первый сезон использует согласованный баланс и цену 1 499 ₽');
  const genres = [...new Set((Array.isArray(input.genres) ? input.genres : []).map(String))].slice(0, 40);
  return db().transaction(async (tx) => {
    await tx.prepare(`INSERT INTO pass_seasons(id,title,created_at) VALUES (?,?,?) ON CONFLICT DO NOTHING`).bind(id, title, now()).run();
    const before = await draft(tx, id);
    await tx.prepare('UPDATE pass_seasons SET title=?,timezone=?,starts_at=?,ends_at=?,price=?,tasks=?::text::jsonb,genres=?::text::jsonb WHERE id=?').bind(title, zone, dates.starts_at, dates.ends_at, price, JSON.stringify(tasks), JSON.stringify(genres), id).run();
    await audit(tx, actor, id, 'save_draft', 'Настройка черновика', { before, after: input });
    return { id };
  });
}
async function inspectAsset(bytes: Buffer, transparent: boolean) {
  if (bytes.length > 8 * 1024 * 1024) throw new ApiError('Максимальный размер изображения — 8 МБ');
  const decoder = sharp(bytes, { limitInputPixels: 25_000_000, animated: false });
  const meta = await decoder.metadata();
  if (!['png','jpeg','webp'].includes(meta.format || '') || !meta.width || !meta.height || meta.width < 64 || meta.height < 64 || (meta.pages || 1) > 1) throw new ApiError('Нужен PNG, WebP или JPEG размером от 64×64');
  if (transparent && (!meta.hasAlpha || (await decoder.stats()).channels.at(-1)!.min === 255)) throw new ApiError('Пин, тег и рамка должны иметь прозрачный фон');
  return { mime: `image/${meta.format === 'jpeg' ? 'jpeg' : meta.format}`, width: meta.width, height: meta.height };
}
async function storeAsset(tx: Tx, bytes: Buffer, source: string, transparent: boolean) {
  const meta = await inspectAsset(bytes, transparent), id = uid();
  await tx.prepare('INSERT INTO pass_assets(id,mime,data,width,height,sha256,source_note,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(id, meta.mime, bytes, meta.width, meta.height, createHash('sha256').update(bytes).digest('hex'), source, now()).run();
  return `/api/battlepass/assets/${id}`;
}
export async function uploadPassItem(actor: string, form: FormData) {
  const rarity = String(form.get('rarity') || 'rare');
  const file = form.get('file'), kind = String(form.get('kind')), name = String(form.get('name') || '').trim(), source = String(form.get('source') || '').trim(), final = String(form.get('final') || '');
  if (!(file instanceof File) || !kinds.includes(kind) || !['common','rare','epic','legendary'].includes(rarity) || !name || name.length > 100 || source.length < 5 || source.length > 1000) throw new ApiError('Укажите файл, тип, название и источник кадра/рисунка');
  const bytes = Buffer.from(await file.arrayBuffer());
  return db().transaction(async (tx) => {
    if (final) {
      if (!finalIds.includes(final) || !final.startsWith(kind + ':')) throw new ApiError('Неверный элемент финального комплекта');
      await draft(tx, 'oni-awakening');
    }
    const image = await storeAsset(tx, bytes, source, kind !== 'background');
    const slug = final ? ({ pin: 'pass-oni', tag: 'pass-oni-tag', frame: 'pass-oni-frame', background: 'pass-oni-background' } as Record<string,string>)[kind] : `pass-${uid()}`;
    const id = final || `${kind}:${slug}`;
    await tx.prepare(`INSERT INTO cosmetics(id,kind,slug,name,image,rarity,access_type,created_at) VALUES (?,?,?,?,?,?,'battlepass',?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,image=excluded.image,rarity=excluded.rarity`).bind(id, kind, slug, name, image, final ? 'legendary' : rarity, now()).run();
    await audit(tx, actor, final ? 'oni-awakening' : null, 'upload_item', source, { id, image });
    return { id, image };
  });
}
export async function savePassReward(actor: string, input: Record<string, unknown>) {
  const season = String(input.season), level = Number(input.level), track = String(input.track);
  const plusDays = Number(input.plus_days || 0);
  if (!Number.isInteger(plusDays) || plusDays < 0 || plusDays > 365) throw new ApiError('Неверное количество дней Плюса');
  const ids = [...new Set((Array.isArray(input.items) ? input.items : []).map(String))];
  if (!Number.isInteger(level) || level < 1 || level > 40 || !['free','premium'].includes(track) || ids.length > 10) throw new ApiError('Неверный уровень, дорожка или набор предметов');
  return db().transaction(async (tx) => {
    await draft(tx, season);
    await tx.prepare('DELETE FROM pass_rewards WHERE season_id=? AND level=? AND track=?').bind(season, level, track).run();
    for (const id of ids) {
      if (finalIds.includes(id) && (season !== 'oni-awakening' || level !== 40 || track !== 'premium')) throw new ApiError('Финальный комплект доступен только на премиальном уровне 40');
      const item = await tx.prepare("SELECT id,kind,name,image FROM cosmetics WHERE id=? AND access_type='battlepass' AND active=1").bind(id).first<{ id: string; kind: string; name: string; image: string }>();
      if (!item || !item.image || !kinds.includes(item.kind)) throw new ApiError('Предмет не готов: загрузите поддерживаемый ассет');
      await tx.prepare('INSERT INTO pass_rewards(season_id,level,track,cosmetic_id,name,preview,kind) VALUES (?,?,?,?,?,?,?)').bind(season, level, track, id, item.name, item.image, item.kind).run();
    }
    if (plusDays) await tx.prepare("INSERT INTO pass_rewards(season_id,level,track,cosmetic_id,name,preview,kind,plus_days) VALUES (?,?,?,?,?,'','plus',?)").bind(season, level, track, 'plus:' + level + ':' + track, plusDays + ' дня Плюса', plusDays).run();
    await audit(tx, actor, season, 'save_rewards', 'Настройка наград черновика', { level, track, items: ids });
    return { ok: true };
  });
}
async function rewardBytes(tx: Tx, preview: string) {
  const match = /^\/api\/battlepass\/assets\/([a-f0-9-]{36})$/.exec(preview);
  if (match) {
    const row = await tx.prepare('SELECT data FROM pass_assets WHERE id=?').bind(match[1]).first<{ data: Uint8Array }>();
    if (!row) throw new Error('Ассет отсутствует');
    return Buffer.from(row.data);
  }
  if (!/^\/(pins|rewards)\/[a-zA-Z0-9/_-]+\.(png|webp|jpg|jpeg)$/.test(preview)) throw new Error('Неподдерживаемый адрес ассета');
  return readFile(path.join(process.cwd(), 'public', preview.slice(1)));
}
export async function passReadiness(s: PassSeason, tx: Tx = db()) {
  const errors: string[] = [];
  if (!s.starts_at || !s.ends_at) errors.push('Не заданы даты сезона');
  if (s.starts_at && Number(s.starts_at) <= now() && s.status === 'draft') errors.push('Начало сезона должно быть в будущем');
  if (!s.tasks.daily) errors.push('Сохраните настройки и задания сезона');
  const eligible = await eligiblePassGenres();
  if (s.genres.length < 2 || s.genres.some((g) => !eligible.some((e) => e.genre === g))) errors.push('Выберите минимум 2 жанра, в каждом от 3 доступных серий с известной длительностью');
  const rewards = (await tx.prepare('SELECT * FROM pass_rewards WHERE season_id=?').bind(s.id).all<PassReward>()).results;
  for (let level = 1; level <= 40; level++) if (!rewards.some((r) => Number(r.level) === level)) errors.push(`Не заполнен уровень ${level}`);
  if (!rewards.some((r) => r.track === 'free')) errors.push('Бесплатная дорожка пуста');
  if (s.id === 'oni-awakening') for (const id of finalIds) if (!rewards.some((r) => r.cosmetic_id === id && Number(r.level) === 40 && r.track === 'premium')) errors.push(`Нет финальной награды ${id}`);
  for (const expected of s.expected_rewards || []) {
    const slot = rewards.filter(r => Number(r.level) === expected.level && r.track === expected.track);
    if (slot.length !== 1 || slot[0].kind !== expected.kind || slot[0].name !== expected.name || (expected.kind === 'plus' && Number(slot[0].plus_days) !== expected.plus_days)) errors.push(`Проверьте награду: ${expected.track === 'free' ? 'Бесплатная' : 'Платная'} · ${expected.level} · ${expected.name}`);
  }
  if (s.expected_rewards?.length) for (const r of rewards) if (!s.expected_rewards.some(e => e.level === Number(r.level) && e.track === r.track)) errors.push(`Лишняя награда: ${r.track} / ${r.level}`);
  for (const r of rewards) {
    if (r.kind === 'plus') continue;
    try { await inspectAsset(await rewardBytes(tx, r.preview), r.kind !== 'background'); }
    catch { errors.push(`Отсутствует или некорректен ассет: ${r.level} / ${r.name}`); }
  }
  return errors;
}
export async function publishPass(actor: string, id: string) {
  // Catalog validation happens outside the transaction to avoid nested local PGlite work.
  const original = await findSeason(id, true);
  if (!original) throw new ApiError('Сезон не найден');
  const originalRewards = (await db().prepare('SELECT * FROM pass_rewards WHERE season_id=? ORDER BY level,track,cosmetic_id').bind(id).all<PassReward>()).results;
  const problems = await passReadiness(original);
  if (problems.length) throw new ApiError(problems.join('; '));
  return db().transaction(async (tx) => {
    await tx.prepare('LOCK TABLE pass_seasons IN SHARE ROW EXCLUSIVE MODE').run();
    const s = await draft(tx, id);
    if (JSON.stringify(s) !== JSON.stringify(original)) throw new ApiError('Черновик изменился, повторите проверку', 409);
    const overlap = await tx.prepare("SELECT id FROM pass_seasons WHERE status='published' AND starts_at<? AND ends_at>?").bind(s.ends_at, s.starts_at).first();
    if (overlap) throw new ApiError('Сезоны не должны пересекаться');
    const rewards = (await tx.prepare('SELECT * FROM pass_rewards WHERE season_id=? ORDER BY level,track,cosmetic_id').bind(id).all<PassReward>()).results;
    if (JSON.stringify(rewards) !== JSON.stringify(originalRewards)) throw new ApiError('Награды изменились, повторите проверку', 409);
    // Snapshot every file in the database. Deployments cannot silently replace published artwork.
    const snapshotted = new Set<string>();
    const previewByCosmetic = new Map<string,string>();
    for (const r of rewards) {
      if (r.kind === 'plus') continue;
      if (previewByCosmetic.has(r.cosmetic_id) && previewByCosmetic.get(r.cosmetic_id) !== r.preview) throw new ApiError('Один предмет имеет разные превью в наградах', 409);
      previewByCosmetic.set(r.cosmetic_id, r.preview);
      if (snapshotted.has(r.cosmetic_id)) continue;
      snapshotted.add(r.cosmetic_id);
      const item = await tx.prepare("SELECT image,active FROM cosmetics WHERE id=? AND access_type='battlepass' FOR UPDATE").bind(r.cosmetic_id).first<{ image: string; active: number }>();
      if (!item || item.active !== 1 || item.image !== r.preview) throw new ApiError('Ассет награды изменился. Назначьте награду повторно.', 409);
      const bytes = await rewardBytes(tx, r.preview);
      await inspectAsset(bytes, r.kind !== 'background');
      if (r.preview.startsWith('/api/battlepass/assets/')) continue;
      const image = await storeAsset(tx, bytes, `Снимок публикации ${id}: ${r.preview}`, r.kind !== 'background');
      await tx.prepare('UPDATE cosmetics SET image=? WHERE id=?').bind(image, r.cosmetic_id).run();
      await tx.prepare('UPDATE pass_rewards SET preview=? WHERE season_id=? AND cosmetic_id=?').bind(image, id, r.cosmetic_id).run();
    }
    await tx.prepare("UPDATE pass_seasons SET status='published',published_at=? WHERE id=?").bind(now(), id).run();
    await audit(tx, actor, id, 'publish', 'Публикация с фиксацией условий и наград', s);
    return { ok: true };
  });
}
export async function reconcilePassPayment(actor: string, providerId: string) {
  if (!/^[a-zA-Z0-9-]{10,100}$/.test(providerId)) throw new ApiError('Некорректный ID транзакции');
  const payment = await paymentFetch('transaction/' + encodeURIComponent(providerId));
  const order = await db().prepare("SELECT id,pass_season_id FROM orders WHERE id=? AND plan='battlepass'").bind(payment.payload || payment.externalId || '').first<{ id: string; pass_season_id: string }>();
  if (!order) throw new ApiError('Транзакция не относится к заказу AniMonster Pass');
  const status = await verifyPayment(providerId);
  await audit(db(), actor, order.pass_season_id, 'reconcile_payment', 'Проверка статуса напрямую в Platega', { providerId, orderId: order.id, status });
  return { status };
}
export async function adjustPassXp(actor: string, season: string, user: string, delta: number, reason: string, requestId: string) {
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100000 || reason.trim().length < 5 || reason.length > 1000 || !/^[a-f0-9-]{36}$/.test(requestId)) throw new ApiError('Нужны корректировка, причина и уникальный номер операции');
  return db().transaction(async (tx) => {
    const s = await findSeason(season, false, tx);
    if (!s) throw new ApiError('Опубликованный сезон не найден');
    const member = await memberLock(tx, season, user);
    const added = await tx.prepare('INSERT INTO pass_xp(season_id,user_id,key,amount,reason,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING RETURNING amount').bind(season, user, 'admin:' + requestId, delta, reason, now()).first();
    if (!added) return { ok: true, duplicate: true };
    if (Number(member.xp) + delta < 0) throw new ApiError('XP не может стать отрицательным');
    await tx.prepare('UPDATE pass_members SET xp=xp+? WHERE season_id=? AND user_id=?').bind(delta, season, user).run();
    await audit(tx, actor, season, 'adjust_xp', reason, { delta, before: member.xp, requestId }, user);
    if (now() >= Number(s.ends_at)) await claimInTransaction(tx, s, user, { ...member, xp: Number(member.xp) + delta });
    return { ok: true };
  });
}
export async function grantPassPremium(actor: string, season: string, user: string, reason: string) {
  reason = reason.trim();
  if (reason.length < 5 || reason.length > 1000) throw new ApiError('Укажите причину выдачи: от 5 до 1000 символов');
  return db().transaction(async (tx) => {
    const s = await findSeason(season, false, tx);
    assertLive(s);
    if (!await tx.prepare('SELECT id FROM users WHERE id=?').bind(user).first()) throw new ApiError('Пользователь не найден', 404);
    const member = await memberLock(tx, season, user);
    if (member.premium) return { ok: true, duplicate: true };
    await tx.prepare('UPDATE pass_members SET premium=true WHERE season_id=? AND user_id=?').bind(season, user).run();
    await audit(tx, actor, season, 'grant_premium', reason, { xp: member.xp }, user);
    const count = await claimInTransaction(tx, s, user, { ...member, premium: true });
    return { ok: true, count };
  });
}
