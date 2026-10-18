import { db } from './core';
import { safeRemoteImageUrl } from './images';

const SHIKIMORI = 'https://shikimori.one';

export async function animeScreenshot(animeId: number): Promise<string | null> {
  const cached = await db()
    .prepare('SELECT data FROM anime_cache WHERE id=?')
    .bind(animeId)
    .first<{ data: string }>();
  const anime = cached
    ? (JSON.parse(cached.data) as { shikimori_id?: number })
    : null;
  const shikimoriId = Number(
    anime?.shikimori_id || (animeId < 100000000 ? animeId : 0),
  );
  if (
    !Number.isInteger(shikimoriId) ||
    shikimoriId < 1 ||
    shikimoriId >= 100000000
  )
    return null;

  const response = await fetch(
    `${SHIKIMORI}/api/animes/${shikimoriId}/screenshots`,
    {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'AniMonster/1.0 (+https://animonster.su)',
      },
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 86400 },
    },
  );
  if (!response.ok) throw new Error(`Screenshots HTTP ${response.status}`);
  const screenshots: unknown = await response.json();
  if (!Array.isArray(screenshots)) return null;
  for (const screenshot of screenshots) {
    if (typeof screenshot?.original !== 'string' || !screenshot.original.trim())
      continue;
    try {
      const url = safeRemoteImageUrl(
        new URL(screenshot.original, SHIKIMORI).href,
      );
      if (
        [
          'shikimori.one',
          'desu.shikimori.one',
          'shikimori.io',
          'desu.shikimori.io',
        ].includes(url.hostname)
      )
        return url.href;
    } catch {
      // Ignore unsupported image hosts and try the next screenshot.
    }
  }
  return null;
}
