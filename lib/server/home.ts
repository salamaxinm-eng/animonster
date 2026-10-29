import type { Anime } from '@/lib/anime';
import { db, now } from './core';
import { cachedCatalog } from './library';

/** Return the home hero from local data only, so rendering never waits on a provider API. */
export async function cachedHomePopular(): Promise<Anime[]> {
  let viewedIds: number[] = [];
  try {
    const month = new Date(now() - 29 * 86400000).toISOString().slice(0, 10);
    const rows = await db()
      .prepare(
        `SELECT anime_id,count(*) AS views FROM daily_views
         WHERE day>=? GROUP BY anime_id ORDER BY views DESC,anime_id LIMIT 5`,
      )
      .bind(month)
      .all<{ anime_id: number; views: number }>();
    viewedIds = rows.results.map((row) => Number(row.anime_id));
  } catch {
    // The catalog cache below is enough to render the page when view stats fail.
  }

  const items: Anime[] = [];
  if (viewedIds.length) {
    try {
      const placeholders = viewedIds.map(() => '?').join(',');
      const rows = await db()
        .prepare(`SELECT id,data FROM anime_cache WHERE id IN (${placeholders})`)
        .bind(...viewedIds)
        .all<{ id: number; data: string }>();
      const byId = new Map<number, Anime>();
      for (const row of rows.results) {
        try {
          byId.set(Number(row.id), JSON.parse(row.data) as Anime);
        } catch {
          // Skip an invalid cache row and continue with the next popular title.
        }
      }
      for (const id of viewedIds) {
        const anime = byId.get(id);
        if (anime && !items.some((item) => item.id === anime.id)) items.push(anime);
      }
    } catch {
      // Continue with the rating-sorted catalog.
    }
  }

  if (items.length < 5) {
    try {
      for (const anime of await cachedCatalog({ limit: 20 })) {
        if (!items.some((item) => item.id === anime.id)) items.push(anime);
        if (items.length === 5) break;
      }
    } catch (error) {
      // A stats outage can use the catalog; a catalog outage must not become a
      // successful empty landing page. Previously loaded items remain usable.
      if (!items.length) throw error;
    }
  }

  return items.slice(0, 5);
}
