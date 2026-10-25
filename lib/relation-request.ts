import type { AnimeRelationsResult } from './server/anime-relations';

export async function requestAnimeRelations(
  animeId: number,
  signal: AbortSignal,
  fresh = false,
  timeout = 8000,
): Promise<AnimeRelationsResult> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal.aborted) abort();
  else signal.addEventListener('abort', abort, { once: true });
  const deadline = setTimeout(abort, timeout);
  try {
    const response = await fetch(`/api/anime-relations?anime_id=${animeId}`, {
      signal: controller.signal,
      cache: fresh ? 'no-store' : 'default',
    });
    if (!response.ok) throw new Error('Relations unavailable');
    const data = await response.json();
    if (
      !data ||
      !Array.isArray(data.mainline) ||
      !Array.isArray(data.branches) ||
      !Array.isArray(data.related)
    )
      throw new Error('Invalid relations');
    return data as AnimeRelationsResult;
  } finally {
    clearTimeout(deadline);
    signal.removeEventListener('abort', abort);
  }
}
