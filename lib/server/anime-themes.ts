import { db, now } from './core';
import type { Anime } from '@/lib/anime';
import { available, findRelease, normalize } from './anime';
import { rememberAnime } from './library';
import { normalizeMatchTitle } from './shikimori-matching';
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
  data?: {
    animes?: ShikimoriAnimeCandidate[];
    genres?: ShikimoriGenre[];
  };
  errors?: Array<{ message?: string }>;
};
type ShikimoriGenre = {
  id: string;
  russian: string;
  kind: string;
};

let cachedThemeCatalog:
  | { expiresAt: number; themes: ShikimoriGenre[] }
  | undefined;

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

async function shikimoriGraphql(query: string, variables?: object) {
  const response = await fetch(SHIKIMORI_GRAPHQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'AniMonster/1.0 (+https://animonster.su)',
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(7000),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Shikimori HTTP ${response.status}`);
  const result = (await response.json()) as ShikimoriResponse;
  if (result.errors?.length) throw new Error('Shikimori GraphQL error');
  return result.data;
}

export async function animeThemeCatalog() {
  if (cachedThemeCatalog && cachedThemeCatalog.expiresAt > now())
    return cachedThemeCatalog.themes;

  const data = await shikimoriGraphql(
    'query { genres(entryType: Anime) { id russian kind } }',
  );
  const themes = (data?.genres || [])
    .filter((item) => item.kind === 'theme' && item.russian?.trim())
    .sort((a, b) => a.russian.localeCompare(b.russian, 'ru'));
  cachedThemeCatalog = { expiresAt: now() + 6 * 60 * 60 * 1000, themes };
  return themes;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  action: (item: T) => Promise<R>,
) {
  const results = Array.from({ length: items.length }) as R[];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await action(items[index]);
      }
    }),
  );
  return results;
}

export async function animeWithTheme(theme: string, search = '') {
  const normalizedTheme = normalizeMatchTitle(theme);
  const catalog = await animeThemeCatalog();
  const selected = catalog.find(
    (item) => normalizeMatchTitle(item.russian) === normalizedTheme,
  );
  if (!selected) return [];

  const data = await shikimoriGraphql(
    `query ($search: String) {
      animes(genre: "${Number(selected.id)}", page: 1, limit: 50, order: ranked, search: $search) {
        id malId name russian synonyms genres { russian kind }
      }
    }`,
    { search: search.trim().slice(0, 100) || null },
  );
  const candidates = data?.animes || [];
  if (!candidates.length) return [];

  const rows = await db()
    .prepare('SELECT data FROM anime_cache ORDER BY updated_at DESC LIMIT 2000')
    .all<{ data: string }>();
  const cached = new Map<string, Anime>();
  for (const row of rows.results) {
    try {
      const anime = JSON.parse(row.data) as Anime;
      if (anime.shikimori_id)
        cached.set('shiki:' + anime.shikimori_id, anime);
      if (anime.mal_id) cached.set('mal:' + anime.mal_id, anime);
    } catch {}
  }

  const resolved = new Map<string, Anime>();
  const unresolved: ShikimoriAnimeCandidate[] = [];
  for (const candidate of candidates) {
    const shikimoriId = Number(candidate.id);
    const malId = Number(candidate.malId);
    const item =
      (Number.isFinite(shikimoriId) && cached.get('shiki:' + shikimoriId)) ||
      (Number.isFinite(malId) && cached.get('mal:' + malId));
    if (item) resolved.set(String(candidate.id), item);
    else if (Number.isFinite(shikimoriId)) unresolved.push(candidate);
  }

  // Fill the first screen from AniLiberty when matching titles are not cached yet.
  const missing = Math.max(0, 24 - resolved.size);
  const toResolve = unresolved.slice(0, Math.min(16, missing));
  const releases = await mapLimit(toResolve, 6, async (candidate) => {
    try {
      const release = await findRelease(Number(candidate.id));
      if (!release || !available(release)) return null;
      const anime = normalize(release);
      const candidateMalId = Number(candidate.malId);
      if (candidateMalId && anime.mal_id && candidateMalId !== anime.mal_id)
        return null;
      return { key: String(candidate.id), anime };
    } catch {
      return null;
    }
  });
  const discovered: Anime[] = [];
  for (const result of releases) {
    if (!result) continue;
    resolved.set(result.key, result.anime);
    discovered.push(result.anime);
  }
  if (discovered.length) await rememberAnime(discovered);

  const output: Anime[] = [];
  const seen = new Set<number>();
  for (const candidate of candidates) {
    const anime = resolved.get(String(candidate.id));
    if (!anime || seen.has(anime.id)) continue;
    seen.add(anime.id);
    output.push(anime);
    if (output.length >= 24) break;
  }
  return output;
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
