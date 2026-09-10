import { db } from '@/lib/server/core';
import type { Anime } from '@/lib/anime';
import { findRelease, normalize, available, liberty } from '@/lib/server/anime';
export async function GET() {
  let counts: Record<string, number> = {};
  const candidates: Anime[] = [];
  try {
    const data = await liberty(
      '/anime/catalog/releases?limit=5&f[sorting]=RATING_DESC',
    );
    candidates.push(...data.data.filter(available).map(normalize));
  } catch {}
  try {
    const rows = await db()
      .prepare(
        'SELECT anime_id,max(title) AS title,max(image) AS image,count(*) AS n FROM collection GROUP BY anime_id ORDER BY n DESC,anime_id LIMIT 5',
      )
      .all<{ anime_id: number; title: string; image: string; n: number }>();
    counts = Object.fromEntries(rows.results.map((x) => [x.anime_id, x.n]));
    await Promise.all(
      rows.results.map(async (row) => {
        if (candidates.some((a) => a.id === row.anime_id)) return;
        try {
          const release = await findRelease(row.anime_id);
          if (release && available(release))
            candidates.push(normalize(release));
        } catch {}
      }),
    );
  } catch {}
  const ranked = candidates.sort(
    (a, b) => (counts[b.id] || 0) - (counts[a.id] || 0),
  );
  return Response.json(
    {
      items: ranked.slice(0, 5),
      source:
        candidates.filter((a) => counts[a.id]).length >= 5
          ? 'Популярно на AniMonster'
          : 'Популярное в каталоге',
    },
    { headers: { 'Cache-Control': 'public, max-age=60' } },
  );
}
