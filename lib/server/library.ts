import { db, now } from './core';
import {
  findRelease,
  liberty,
  available,
  normalize,
  type Release,
} from './anime';
import type { Anime, Episode } from '@/lib/anime';
type CachedCatalogOptions = {
  genre?: string;
  kind?: string;
  status?: string;
  sort?: 'rating' | 'fresh' | 'year';
  limit?: number;
  offset?: number;
  query?: string;
};
export type CachedCatalogPage = {
  items: Anime[];
  total: number;
};

export async function cachedCatalog({
  genre = '',
  kind = '',
  limit = 50,
  offset = 0,
  query = '',
}: CachedCatalogOptions = {}) {
  return (await cachedCatalogPage({ genre, kind, limit, offset, query })).items;
}

export async function cachedCatalogPage({
  genre = '',
  kind = '',
  status = '',
  sort = 'rating',
  limit = 50,
  offset = 0,
  query = '',
}: CachedCatalogOptions = {}): Promise<CachedCatalogPage> {
  const where: string[] = [];
  const values: unknown[] = [];
  if (genre) {
    where.push('genres_index @> ?::jsonb');
    values.push(JSON.stringify([genre]));
  }
  if (kind) {
    where.push('kind_index=?');
    values.push(kind);
  }
  if (status) {
    where.push('status_index=?');
    values.push(status);
  }
  if (query.trim()) {
    where.push('search_text LIKE ?');
    values.push(`%${query.trim().toLocaleLowerCase('ru-RU')}%`);
  }
  const filter = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const safeOffset = Math.max(0, Math.floor(offset));
  const ordering =
    sort === 'fresh'
      ? 'updated_at DESC,id'
      : sort === 'year'
        ? 'year_index DESC,score_index DESC,id'
        : 'score_index DESC,year_index DESC,id';
  const [rows, count] = await Promise.all([
    db()
      .prepare(
        `SELECT data FROM anime_cache${filter} ORDER BY ${ordering} LIMIT ? OFFSET ?`,
      )
      .bind(...values, safeLimit, safeOffset)
      .all<{ data: string }>(),
    db()
      .prepare(`SELECT count(*) AS total FROM anime_cache${filter}`)
      .bind(...values)
      .first<{ total: number }>(),
  ]);
  const items = rows.results.flatMap((row) => {
    try {
      return [JSON.parse(row.data) as Anime];
    } catch {
      return [];
    }
  });
  return {
    items,
    total: Number(count?.total || 0),
  };
}
export async function saveAnime(
  anime: Anime,
  episodes: { ordinal: number; duration: number }[] = [],
) {
  await db()
    .prepare(
      `INSERT INTO anime_cache(id,data,episodes,updated_at,primary_provider,search_text,kind_index,status_index,year_index,score_index,genres_index)
       VALUES (?,?,?,?,?,?,?,?,?,?,?::jsonb)
       ON CONFLICT(id) DO UPDATE SET data=excluded.data,
       episodes=CASE WHEN excluded.episodes='[]' THEN anime_cache.episodes ELSE excluded.episodes END,
       updated_at=excluded.updated_at,primary_provider=excluded.primary_provider,
       search_text=excluded.search_text,kind_index=excluded.kind_index,status_index=excluded.status_index,
       year_index=excluded.year_index,score_index=excluded.score_index,genres_index=excluded.genres_index`,
    )
    .bind(
      anime.id,
      JSON.stringify(anime),
      JSON.stringify(episodes),
      now(),
      anime.primary_provider || 'aniliberty',
      `${anime.russian} ${anime.name}`.toLocaleLowerCase('ru-RU'),
      anime.kind || '',
      anime.status || '',
      Number(String(anime.aired_on || '').slice(0, 4)) || 0,
      Number(anime.score) || 0,
      JSON.stringify(anime.genres || []),
    )
    .run();
}
export async function rememberAnime(items: Anime[]) {
  if (!items.length) return;
  await Promise.all(items.map((anime) => saveAnime(anime)));
}
export async function cacheAnime(anime: Anime, episodes?: Episode[]) {
  const existing = await db()
    .prepare('SELECT data,primary_provider FROM anime_cache WHERE id=?')
    .bind(anime.id)
    .first<{ data: string; primary_provider: string }>();
  let merged = anime;
  if (existing?.primary_provider === 'kodik') {
    try {
      const current = JSON.parse(existing.data) as Anime;
      merged = {
        ...anime,
        ...current,
        release_id: anime.release_id || current.release_id,
        mal_id: anime.mal_id || current.mal_id,
        providers: [
          ...new Set<'aniliberty' | 'kodik'>([
            ...(current.providers || []),
            'aniliberty',
          ]),
        ],
        primary_provider: 'kodik',
      };
    } catch {}
  }
  await saveAnime(
    merged,
    episodes?.map((episode) => ({
      ordinal: episode.ordinal,
      duration: episode.duration,
    })) || [],
  );
}
export async function getAnime(id: number) {
  const cached = await db()
    .prepare('SELECT data,episodes,updated_at FROM anime_cache WHERE id=?')
    .bind(id)
    .first<{ data: string; episodes: string; updated_at: number }>();
  if (cached) {
    try {
      const anime = JSON.parse(cached.data) as Anime;
      if (
        anime.providers?.includes('kodik') &&
        process.env.KODIK_CATALOG_ENABLED === 'true'
      )
        return { ...cached, anime };
    } catch {}
  }
  if (cached && cached.episodes !== '[]' && cached.updated_at > now() - 3600000)
    return { ...cached, anime: JSON.parse(cached.data) as Anime };
  const known: Anime | undefined = cached ? JSON.parse(cached.data) : undefined;
  const found: Release | undefined = known?.release_id
    ? await liberty('/anime/releases/' + known.release_id)
    : await findRelease(id);
  if (!found || !available(found)) return null;
  const release: Release = await liberty('/anime/releases/' + found.id);
  if (!available(release)) return null;
  const anime = normalize(release);
  await cacheAnime(anime, release.episodes);
  return {
    anime,
    episodes: JSON.stringify(
      release.episodes?.map((e) => ({
        ordinal: e.ordinal,
        duration: e.duration,
      })) || [],
    ),
  };
}
export async function getAnimeByAlias(alias: string) {
  if (!/^[a-z0-9-]{2,100}$/.test(alias)) return null;
  try {
    const release: Release = await liberty(
      '/anime/releases/' + encodeURIComponent(alias),
    );
    if (!available(release)) return null;
    const anime = normalize(release);
    await cacheAnime(anime, release.episodes);
    return {
      anime,
      episodes: JSON.stringify(
        release.episodes?.map((e) => ({
          ordinal: e.ordinal,
          duration: e.duration,
        })) || [],
      ),
    };
  } catch {
    return null;
  }
}
export type Genre = {
  id: number;
  name: string;
  image?: {
    preview?: string;
    thumbnail?: string;
    optimized?: { preview?: string; thumbnail?: string };
  };
  total_releases?: number;
};
export async function genreList(): Promise<Genre[]> {
  if (process.env.KODIK_CATALOG_ENABLED === 'true') {
    const rows = await db()
      .prepare(
        `SELECT genre AS name,count(*) AS total_releases
         FROM anime_cache CROSS JOIN LATERAL jsonb_array_elements_text(genres_index) AS genre
         GROUP BY genre ORDER BY genre`,
      )
      .all<{ name: string; total_releases: number }>();
    if (rows.results.length)
      return rows.results.map((genre, index) => ({
        id: index + 1,
        name: genre.name,
        total_releases: Number(genre.total_releases),
      }));
  }
  return liberty('/anime/genres');
}
export async function genresCatalog(genres: string[], ongoing = false) {
  const cached = await cachedCatalog({ genre: genres[0], limit: 50 });
  if (cached.length >= 18) return cached;
  try {
    const ids = genres.length
      ? (await genreList())
          .filter((g) => genres.includes(g.name))
          .map((g) => g.id)
      : [];
    const q = new URLSearchParams({ limit: '50', 'f[sorting]': 'RATING_DESC' });
    if (ids.length) q.set('f[genres]', ids.join(','));
    if (ongoing) q.set('f[publish_statuses]', 'IS_ONGOING');
    const result = await liberty('/anime/catalog/releases?' + q);
    const items = result.data.filter(available).map(normalize) as Anime[];
    await rememberAnime(items);
    return items;
  } catch {
    return cached;
  }
}
