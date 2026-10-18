// Shared, bounded parsing of untrusted trace.moe responses. No image data is persisted.
export const TRACE_SEARCH_URL = 'https://api.trace.moe/search?anilistInfo';
export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const UNCERTAIN_SIMILARITY = 0.9;

export type SceneMatch = {
  anilistId: number;
  title: string;
  episode: string | null;
  from: number | null;
  to: number | null;
  similarity: number;
  image: string | null;
};
export type CatalogSceneMatch = {
  anilistId: number;
  title?: string;
  anime: { id: number; title: string } | null;
  unavailable?: boolean;
  unmatched?: boolean;
};
export const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export const positiveId = (value: unknown): number | null =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value > 0 &&
  value < 1_000_000_000
    ? value
    : null;
export const boundedText = (value: unknown, max = 300) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';
const seconds = (value: unknown) =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value < 604800
    ? value
    : null;

export function sceneImage(value: unknown) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      ['api.trace.moe', 'media.trace.moe'].includes(url.hostname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function parseSceneMatches(value: unknown): SceneMatch[] {
  const payload = record(value);
  if (!Array.isArray(payload.result))
    throw new Error('Сервис вернул некорректный ответ. Попробуйте позже.');
  const matches = new Map<number, SceneMatch>();
  for (const raw of payload.result.slice(0, 100)) {
    const item = record(raw);
    const info = record(item.anilist);
    const id = positiveId(info.id) || positiveId(item.anilist);
    const similarity = item.similarity;
    if (
      !id ||
      typeof similarity !== 'number' ||
      !Number.isFinite(similarity) ||
      similarity < 0 ||
      similarity > 1
    )
      continue;
    if ((matches.get(id)?.similarity ?? -1) >= similarity) continue;
    const titles = record(info.title);
    const episode =
      typeof item.episode === 'number' &&
      Number.isFinite(item.episode) &&
      item.episode >= 0
        ? String(item.episode)
        : boundedText(item.episode, 48);
    const from = seconds(item.from),
      to = seconds(item.to);
    matches.set(id, {
      anilistId: id,
      title:
        boundedText(titles.romaji) ||
        boundedText(titles.english) ||
        boundedText(titles.native) ||
        `Аниме AniList #${id}`,
      episode: episode || null,
      from,
      to: to !== null && (from === null || to >= from) ? to : null,
      similarity,
      image: sceneImage(item.image),
    });
  }
  return [...matches.values()]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 3);
}

export function traceError(
  status: number,
  payload: unknown,
  retryAfter?: string | null,
) {
  const error = boundedText(record(payload).error).toLowerCase();
  if (
    status === 429 ||
    status === 402 ||
    /quota|concurrency|rate.limit/.test(error)
  ) {
    const wait =
      retryAfter && /^\d{1,6}$/.test(retryAfter)
        ? ` Повторите через ${retryAfter} сек.`
        : ' Попробуйте позже.';
    return /quota|depleted/.test(error)
      ? 'Лимит распознавания trace.moe для вашей сети исчерпан. Попробуйте позже.'
      : 'trace.moe временно ограничил запросы.' + wait;
  }
  if (status === 413)
    return 'Изображение слишком большое. Уменьшите область кадра.';
  if (status === 400 || status === 415 || status === 422)
    return 'trace.moe не смог прочитать изображение. Выберите другой JPG, PNG или WebP.';
  if (status >= 500)
    return 'trace.moe сейчас перегружен или недоступен. Попробуйте позже.';
  return 'Не удалось распознать кадр. Попробуйте позже или выберите другое изображение.';
}

export function sceneTime(value: number) {
  const seconds = Math.floor(value);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export type Crop = { x: number; y: number; width: number; height: number };
export function fitCrop(
  width: number,
  height: number,
  ratio: number,
  scale = 1,
  x = 0.5,
  y = 0.5,
): Crop {
  const w =
    Math.min(1, (ratio * height) / width) * Math.max(0.2, Math.min(1, scale));
  const h = (w * width) / ratio / height;
  return {
    x: (1 - w) * Math.max(0, Math.min(1, x)),
    y: (1 - h) * Math.max(0, Math.min(1, y)),
    width: w,
    height: h,
  };
}
