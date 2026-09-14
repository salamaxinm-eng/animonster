import { db, now } from './core';
import type { Anime } from '@/lib/anime';
import {
  exactShikimoriMatch,
  russianThemes,
  type ShikimoriAnimeCandidate,
} from './shikimori-matching';

const SHIKIMORI_GRAPHQL = 'https://shikimori.one/api/graphql';
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
const EMPTY_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const ERROR_CACHE_TTL = 5 * 60 * 1000;
const QUERY = `query ($ids: String, $search: String) {
  animes(ids: $ids, search: $search, limit: 10) {
    id malId name russian synonyms genres { russian kind }
  }
}`;

type ThemeCacheRow = {
  themes: string;
  status: 'ok' | 'not_found' | 'error';
  checked_at: number;
};
type ShikimoriResponse = {
  data?: { animes?: ShikimoriAnimeCandidate[] };
  errors?: Array<{ message?: string }>;
};

async function searchShikimori(variables: { ids?: string; search?: string }) {
  const response = await fetch(SHIKIMORI_GRAPHQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'AniMonster/1.0 (+https://animonster.su)',
    },
    body: JSON.stringify({ query: QUERY, variables }),
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Shikimori HTTP ${response.status}`);
  const result = (await response.json()) as ShikimoriResponse;
  if (result.errors?.length) throw new Error('Shikimori GraphQL error');
  return result.data?.animes || [];
}

async function resolveThemes(anime: Anime) {
  if (anime.shikimori_id) {
    const candidates = await searchShikimori({
      ids: String(anime.shikimori_id),
    });
    const match = exactShikimoriMatch(candidates, anime);
    return match ? russianThemes(match) : [];
  }

  const searchTitles = [
    ...new Set([anime.russian, anime.name].filter(Boolean)),
  ];
  for (const search of searchTitles) {
    const candidates = await searchShikimori({ search });
    const match = exactShikimoriMatch(candidates, anime);
    if (match) return russianThemes(match);
  }
  return [];
}

export async function animeThemes(id: number) {
  const cached = await db()
    .prepare(
      'SELECT themes,status,checked_at FROM anime_themes_cache WHERE anime_id=?',
    )
    .bind(id)
    .first<ThemeCacheRow>();
  const cacheTtl =
    cached?.status === 'ok'
      ? CACHE_TTL
      : cached?.status === 'not_found'
        ? EMPTY_CACHE_TTL
        : ERROR_CACHE_TTL;
  if (cached && cached.checked_at > now() - cacheTtl) {
    return {
      themes: JSON.parse(cached.themes) as string[],
      unavailable: cached.status === 'error',
    };
  }

  const row = await db()
    .prepare('SELECT data FROM anime_cache WHERE id=?')
    .bind(id)
    .first<{ data: string }>();
  if (!row) return { themes: [], unavailable: false };

  const anime = JSON.parse(row.data) as Anime;
  try {
    const themes = await resolveThemes(anime);
    await db()
      .prepare(
        'INSERT INTO anime_themes_cache(anime_id,themes,status,checked_at) VALUES (?,?,?,?) ON CONFLICT(anime_id) DO UPDATE SET themes=excluded.themes,status=excluded.status,checked_at=excluded.checked_at',
      )
      .bind(
        id,
        JSON.stringify(themes),
        themes.length ? 'ok' : 'not_found',
        now(),
      )
      .run();
    return { themes, unavailable: false };
  } catch {
    await db()
      .prepare(
        "INSERT INTO anime_themes_cache(anime_id,themes,status,checked_at) VALUES (?,'[]','error',?) ON CONFLICT(anime_id) DO UPDATE SET status='error',checked_at=excluded.checked_at",
      )
      .bind(id, now())
      .run();
    return { themes: [], unavailable: true };
  }
}
