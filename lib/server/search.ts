import type { Anime } from '@/lib/anime';
import { themeAliases } from '@/lib/anime-taxonomy';
import { db } from './core';
import { compactAnime } from './anime';
import { normalizeMatchTitle } from './shikimori-matching';
import { groupSearchAnime, type RelationCard } from './anime-relations';
import { canonicalizeAnimeIdentities } from './search-metadata';

export type SearchAnimeResult = { type: 'anime'; item: Anime };
export type SearchFranchiseResult = {
  type: 'franchise';
  id: string;
  title: string;
  items: RelationCard[];
};
export type SearchResponse = {
  results: (SearchAnimeResult | SearchFranchiseResult)[];
  pagination: { page: number; pages: number; total: number };
};

type SearchOptions = {
  query?: string;
  genres?: string[];
  themes?: string[];
  kind?: 'tv' | 'movie' | '';
  status?: 'ongoing' | 'released' | '';
  page?: number;
  limit?: number;
};

export async function searchAnime({
  query = '',
  genres = [],
  themes = [],
  kind = '',
  status = '',
  page = 1,
  limit = 24,
}: SearchOptions = {}): Promise<SearchResponse> {
  const normalized = normalizeMatchTitle(query).slice(0, 120);
  const numericQuery = /^\d{1,9}$/.test(query.trim())
    ? Number(query.trim())
    : 0;
  const safePage = Math.max(1, Math.min(10000, Math.floor(page)));
  const safeLimit = Math.max(1, Math.min(48, Math.floor(limit)));
  const offset = (safePage - 1) * safeLimit;
  const fuzzy = normalized.length >= 3;
  const where: string[] = [];
  const values: unknown[] = [];
  if (normalized) {
    if (fuzzy) {
      where.push(
        `(m.normalized_titles LIKE ? OR EXISTS (
          SELECT 1 FROM unnest(m.normalized_aliases) alias
          WHERE similarity(alias,?) >= 0.28 OR replace(alias,' ','') LIKE ?
        ))`,
      );
      values.push(
        `%${normalized}%`,
        normalized,
        `%${normalized.replaceAll(' ', '')}%`,
      );
    } else {
      where.push(
        `EXISTS(SELECT 1 FROM unnest(m.normalized_aliases) alias WHERE alias=? OR alias LIKE ?)`,
      );
      values.push(normalized, `${normalized}%`);
    }
  }
  if (numericQuery) {
    where[0] = `(a.id=? OR ${where[0]})`;
    values.unshift(numericQuery);
  }
  if (genres.length) {
    where.push('a.genres_index @> ?::text::jsonb');
    values.push(JSON.stringify(genres));
  }
  for (const theme of themes) {
    const aliases = themeAliases(theme);
    where.push(
      '(' +
        aliases
          .map(
            () =>
              `(COALESCE(m.themes,'[]'::jsonb) || COALESCE(t.themes::jsonb,'[]'::jsonb) || COALESCE(a.genres_index,'[]'::jsonb)) @> ?::text::jsonb`,
          )
          .join(' OR ') +
        ')',
    );
    values.push(...aliases.map((alias) => JSON.stringify([alias])));
  }
  if (kind) {
    where.push('a.kind_index=?');
    values.push(kind);
  }
  if (status) {
    where.push('a.status_index=?');
    values.push(status);
  }
  const titleScore = normalized
    ? `COALESCE((SELECT max(CASE
        WHEN alias=? THEN 1000
        WHEN replace(alias,' ','')=? THEN 980
        WHEN alias LIKE ? THEN 800
        WHEN alias LIKE ? THEN 620
        WHEN alias LIKE ? THEN 450
        ELSE similarity(alias,?)*300 END)
      FROM unnest(m.normalized_aliases) alias),0)`
    : '0';
  const score = numericQuery
    ? `CASE WHEN a.id=? THEN 2000 ELSE ${titleScore} END`
    : titleScore;
  const scoreValues: (string | number)[] = normalized
    ? [
        normalized,
        normalized.replaceAll(' ', ''),
        `${normalized}%`,
        `% ${normalized}%`,
        `%${normalized}%`,
        normalized,
      ]
    : [];
  if (numericQuery) scoreValues.unshift(numericQuery);
  const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows, count] = await Promise.all([
    db()
      .prepare(
        `SELECT a.data,${score} AS relevance
         FROM anime_cache a
         LEFT JOIN anime_search_metadata m ON m.anime_id=a.id
         LEFT JOIN anime_themes_cache t ON t.anime_id=a.id
         ${filter}
         ORDER BY relevance DESC,a.score_index DESC,a.year_index DESC,a.id
         LIMIT ? OFFSET ?`,
      )
      .bind(...scoreValues, ...values, safeLimit, offset)
      .all<{ data: string; relevance: number }>(),
    db()
      .prepare(
        `SELECT count(*) AS total FROM anime_cache a
         LEFT JOIN anime_search_metadata m ON m.anime_id=a.id
         LEFT JOIN anime_themes_cache t ON t.anime_id=a.id ${filter}`,
      )
      .bind(...values)
      .first<{ total: number }>(),
  ]);
  const items = await canonicalizeAnimeIdentities(
    compactAnime(
      rows.results.flatMap((row) => {
        try {
          return [JSON.parse(row.data) as Anime];
        } catch {
          return [];
        }
      }),
    ),
  );
  const total = Number(count?.total || 0);
  const grouped =
    normalized && !numericQuery
      ? await groupSearchAnime(items)
      : { groups: [], standalone: items };
  return {
    results: [
      ...grouped.groups,
      ...grouped.standalone.map(
        (item): SearchAnimeResult => ({ type: 'anime', item }),
      ),
    ],
    pagination: {
      page: safePage,
      pages: Math.max(1, Math.ceil(total / safeLimit)),
      total,
    },
  };
}
