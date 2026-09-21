import { db } from '@/lib/server/core';
import type { Anime } from '@/lib/anime';
import { normalize, available, liberty } from '@/lib/server/anime';
import { cachedCatalog, rememberAnime } from '@/lib/server/library';
export async function GET() {
  let counts: Record<string, number> = {};
  const candidates: Anime[] = [];
  try {
    const rows = await db()
      .prepare(
        `SELECT anime_id, SUM(n) AS n FROM (
           SELECT anime_id, count(*) * 5 AS n FROM daily_views GROUP BY anime_id
           UNION ALL
           SELECT anime_id, count(*) * 2 AS n FROM collection WHERE favorite=1 GROUP BY anime_id
           UNION ALL
           SELECT anime_id, count(*) AS n FROM history GROUP BY anime_id
         ) site_activity GROUP BY anime_id ORDER BY n DESC,anime_id LIMIT 50`,
      )
      .all<{ anime_id: number; n: number }>();
    counts = Object.fromEntries(rows.results.map((x) => [x.anime_id, x.n]));
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
  const score = (anime: Anime) => Number(anime.score) || 0;
  const ranked = candidates.sort(
    (a, b) => (counts[b.id] || 0) - (counts[a.id] || 0) || score(b) - score(a),
  );
  return Response.json(
    {
      items: ranked.slice(0, 5),
      source: candidates.filter((a) => counts[a.id]).length
        ? 'Топ AniMonster'
        : 'Топ сайта',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
