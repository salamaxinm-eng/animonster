import type { Anime } from '@/lib/anime';
import { db } from './core';
import { compactAnime } from './anime';
import { normalizeMatchTitle } from './shikimori-matching';

export type SearchAnimeResult = { type: 'anime'; item: Anime };
export type SearchResponse = {
  results: SearchAnimeResult[];
  pagination: { page: number; pages: number; total: number };
};

type SearchOptions = { query?: string; page?: number; limit?: number };

export async function searchAnime({
  query = '',
  page = 1,
  limit = 24,
}: SearchOptions = {}): Promise<SearchResponse> {
  const normalized = normalizeMatchTitle(query).slice(0, 120);
  const safePage = Math.max(1, Math.min(10000, Math.floor(page)));
  const safeLimit = Math.max(1, Math.min(48, Math.floor(limit)));
  const offset = (safePage - 1) * safeLimit;
  const fuzzy = normalized.length >= 3;
  const where = normalized
    ? fuzzy
      ? `(m.normalized_titles LIKE ? OR similarity(m.normalized_titles,?) >= 0.28)`
      : `EXISTS(SELECT 1 FROM unnest(m.normalized_aliases) alias WHERE alias=? OR alias LIKE ?)`
    : '';
  const values: unknown[] = normalized
    ? fuzzy
      ? [`%${normalized}%`, normalized]
      : [normalized, `${normalized}%`]
    : [];
  const score = normalized
    ? `COALESCE((SELECT max(CASE
        WHEN alias=? THEN 1000
        WHEN alias LIKE ? THEN 800
        WHEN alias LIKE ? THEN 620
        WHEN alias LIKE ? THEN 450
        ELSE similarity(alias,?)*300 END)
      FROM unnest(m.normalized_aliases) alias),0)`
    : '0';
  const scoreValues = normalized
    ? [
        normalized,
        `${normalized}%`,
        `% ${normalized}%`,
        `%${normalized}%`,
        normalized,
      ]
    : [];
  const filter = where ? `WHERE ${where}` : '';
  const [rows, count] = await Promise.all([
    db()
      .prepare(
        `SELECT a.data,${score} AS relevance
         FROM anime_cache a
         JOIN anime_search_metadata m ON m.anime_id=a.id
         ${filter}
         ORDER BY relevance DESC,a.score_index DESC,a.year_index DESC,a.id
         LIMIT ? OFFSET ?`,
      )
      .bind(...scoreValues, ...values, safeLimit, offset)
      .all<{ data: string; relevance: number }>(),
    db()
      .prepare(
        `SELECT count(*) AS total FROM anime_cache a
         JOIN anime_search_metadata m ON m.anime_id=a.id ${filter}`,
      )
      .bind(...values)
      .first<{ total: number }>(),
  ]);
  const items = compactAnime(
    rows.results.flatMap((row) => {
      try {
        return [JSON.parse(row.data) as Anime];
      } catch {
        return [];
      }
    }),
  );
  const total = Number(count?.total || 0);
  return {
    results: items.map((item) => ({ type: 'anime', item })),
    pagination: {
      page: safePage,
      pages: Math.max(1, Math.ceil(total / safeLimit)),
      total,
    },
  };
}
