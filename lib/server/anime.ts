import type { Anime, Episode } from '@/lib/anime';
export const LIBERTY = 'https://api.anilibria.app';
export type Release = {
  id: number;
  name: { main: string; english: string };
  alias: string;
  poster: { src: string };
  shikimori?: { id: number; rating: number };
  type: { value: string };
  year: number;
  episodes_total: number;
  description: string;
  genres: { name: string }[];
  added_in_users_favorites: number;
  is_blocked_by_geo: boolean;
  is_blocked_by_copyrights: boolean;
  episodes?: Episode[];
};
export async function liberty(path: string) {
  const r = await fetch(LIBERTY + '/api/v1' + path, {
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw Error('Источник временно недоступен');
  return r.json() as Promise<any>;
}
export const available = (r: Release) =>
  !r.is_blocked_by_geo && !r.is_blocked_by_copyrights;
export async function findRelease(id: number): Promise<Release | undefined> {
  if (id >= 100000000 && id < 101000000) {
    const release: Release = await liberty(
      '/anime/releases/' + (id - 100000000),
    );
    return normalize(release).id === id ? release : undefined;
  }
  const response = await fetch('https://shikimori.one/api/animes/' + id, {
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return;
  const anime = (await response.json()) as { name: string };
  const candidates: Release[] = await liberty(
    '/app/search/releases?query=' + encodeURIComponent(anime.name),
  );
  return candidates.find((release) => release.shikimori?.id === id);
}
export function normalize(r: Release): Anime {
  return {
    id: r.shikimori?.id || 100000000 + r.id,
    release_id: r.id,
    russian: r.name.main,
    name: r.name.english || r.name.main,
    image: { original: new URL(r.poster.src, LIBERTY).href },
    score: r.shikimori?.rating ? String(r.shikimori.rating) : '—',
    kind: r.type.value === 'MOVIE' ? 'movie' : 'tv',
    episodes: r.episodes_total || r.episodes?.length || 0,
    aired_on: String(r.year),
    description: r.description,
    genres: r.genres?.map((x) => x.name) || [],
    popularity: r.added_in_users_favorites || 0,
  };
}
