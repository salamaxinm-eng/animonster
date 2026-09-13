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
  limit?: number;
  query?: string;
};

export async function cachedCatalog({
  genre = '',
  kind = '',
  limit = 50,
  query = '',
}: CachedCatalogOptions = {}) {
  const rows = await db()
    .prepare('SELECT data FROM anime_cache ORDER BY updated_at DESC LIMIT 500')
    .all<{ data: string }>();
  const needle = query.trim().toLocaleLowerCase('ru-RU');
  return rows.results
    .flatMap((row) => {
      try {
        return [JSON.parse(row.data) as Anime];
      } catch {
        return [];
      }
    })
    .filter(
      (anime) =>
        (!genre ||
          anime.genres?.some(
            (value) =>
              value.toLocaleLowerCase('ru-RU') ===
              genre.toLocaleLowerCase('ru-RU'),
          )) &&
        (!kind || anime.kind === kind) &&
        (!needle ||
          `${anime.russian} ${anime.name}`
            .toLocaleLowerCase('ru-RU')
            .includes(needle)),
    )
    .sort((left, right) => Number(right.score) - Number(left.score))
    .slice(0, Math.max(1, limit));
}
export async function rememberAnime(items: Anime[]) {
  if (!items.length) return;
  await db().batch(
    items.map((a) =>
      db()
        .prepare(
          "INSERT INTO anime_cache(id,data,episodes,updated_at) VALUES (?,?,'[]',?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
        )
        .bind(a.id, JSON.stringify(a), now()),
    ),
  );
}
export async function cacheAnime(anime: Anime, episodes?: Episode[]) {
  await db()
    .prepare(
      "INSERT INTO anime_cache(id,data,episodes,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,episodes=CASE WHEN excluded.episodes='[]' THEN anime_cache.episodes ELSE excluded.episodes END,updated_at=excluded.updated_at",
    )
    .bind(
      anime.id,
      JSON.stringify(anime),
      JSON.stringify(
        episodes?.map((e) => ({ ordinal: e.ordinal, duration: e.duration })) ||
          [],
      ),
      now(),
    )
    .run();
}
export async function getAnime(id: number) {
  const cached = await db()
    .prepare('SELECT data,episodes,updated_at FROM anime_cache WHERE id=?')
    .bind(id)
    .first<{ data: string; episodes: string; updated_at: number }>();
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
