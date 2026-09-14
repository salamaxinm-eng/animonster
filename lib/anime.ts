export type Anime = {
  id: number;
  release_id?: number;
  shikimori_id?: number;
  mal_id?: number;
  name: string;
  russian: string;
  image: { original: string };
  score: string;
  kind: string;
  episodes: number;
  aired_on: string;
  description?: string;
  genres?: string[];
  popularity?: number;
  age_rating?: string;
  is_adult?: boolean;
  reason?: string;
};
export type SkipSegment = {
  start: number;
  stop: number;
};
export function proxyImageUrl(source?: string) {
  if (!source) return '';
  if (source.startsWith('/') && !source.startsWith('//')) return source;
  const absolute = source.startsWith('https://')
    ? source
    : 'https://shikimori.one' + source;
  return '/api/image?url=' + encodeURIComponent(absolute);
}

export const posterUrl = (anime: Anime) => proxyImageUrl(anime.image.original);
export type Episode = {
  id: string;
  ordinal: number;
  name: string;
  duration: number;
  opening?: SkipSegment;
  ending?: SkipSegment;
  free_at?: number;
  plus_locked?: boolean;
  hls_480: string | null;
  hls_720: string | null;
  hls_1080: string | null;
};

export type Voiceover = {
  id: string;
  title: string;
  provider: 'aniliberty' | 'kodik';
  episodes: number;
  player_url?: string;
};
