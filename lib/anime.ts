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
  primary_provider?: 'kodik' | 'aniliberty';
  providers?: ('kodik' | 'aniliberty')[];
  status?: 'anons' | 'ongoing' | 'released' | '';
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

export function kodikPlayerPath(animeId: number, translation: string) {
  return `/api/kodik/player?anime_id=${animeId}&translation=${encodeURIComponent(translation)}`;
}

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
  episode_ordinals?: number[];
  player_url?: string;
  translation_type?: 'voice' | 'subtitles';
};

export function voiceoverEpisodeIndices(episodes: Episode[], voiceover?: Voiceover) {
  const ordinals = voiceover?.episode_ordinals ? new Set(voiceover.episode_ordinals) : null;
  return episodes.flatMap((episode, index) =>
    (ordinals ? ordinals.has(episode.ordinal) : episode.ordinal <= (voiceover?.episodes || 0)) ? [index] : [],
  );
}

export function initialVoiceover(voiceovers: Voiceover[], episode: number) {
  const available = (v: Voiceover) => v.episode_ordinals ? v.episode_ordinals.includes(episode) : v.episodes >= episode;
  return [...voiceovers].sort((a,b) => Number(available(b))-Number(available(a)) ||
    (b.episode_ordinals?.length ?? b.episodes)-(a.episode_ordinals?.length ?? a.episodes) ||
    Number(a.translation_type==='subtitles')-Number(b.translation_type==='subtitles'))[0];
}
