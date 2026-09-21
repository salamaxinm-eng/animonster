import { db, now } from '@/lib/server/core';
import type { Anime } from '@/lib/anime';
import { normalize, available, liberty } from '@/lib/server/anime';
import { cachedCatalog, getAnime, rememberAnime } from '@/lib/server/library';
export async function GET() {
  const candidates: Anime[] = [];
  let viewedCount = 0;
  try {
    const month = new Date(now() - 29 * 86400000).toISOString().slice(0, 10);
    const rows = await db()
      .prepare(
        `SELECT anime_id,count(*) AS views FROM daily_views
         WHERE day>=? GROUP BY anime_id ORDER BY views DESC,anime_id LIMIT 5`,
      )
      .bind(month)
      .all<{ anime_id: number; views: number }>();
    const viewed = await Promise.all(
      rows.results.map((row) =>
        getAnime(Number(row.anime_id)).catch(() => null),
      ),
    );
    for (const result of viewed)
      if (result && !candidates.some((item) => item.id === result.anime.id))
        candidates.push(result.anime);
    viewedCount = candidates.length;
  } catch {}
  const cached = await cachedCatalog({ limit: 20 }).catch(() => []);
  for (const anime of cached)
    if (!candidates.some((item) => item.id === anime.id))
      candidates.push(anime);
  if (candidates.length < 5)
    try {
      const data = await liberty(
        '/anime/catalog/releases?limit=5&f[sorting]=RATING_DESC',
      );
      const fresh = data.data.filter(available).map(normalize) as Anime[];
      await rememberAnime(fresh);
      for (const anime of fresh)
        if (!candidates.some((item) => item.id === anime.id))
          candidates.push(anime);
    } catch {}
  return Response.json(
    {
      items: candidates.slice(0, 5),
      source: viewedCount ? 'Топ AniMonster' : 'Топ сайта',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
