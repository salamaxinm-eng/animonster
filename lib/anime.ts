export type Anime = {
  id: number;
  release_id?: number;
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
};
export const posterUrl = (a: Anime) =>
  a.image.original.startsWith('https://')
    ? a.image.original
    : 'https://shikimori.one' + a.image.original;
export type Episode = {
  id: string;
  ordinal: number;
  name: string;
  duration: number;
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
