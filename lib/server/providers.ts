import type { Anime, Episode, Voiceover } from '@/lib/anime';

export type CatalogQuery = { page: number; limit: number; search?: string; genre?: string; status?: 'ongoing' | 'completed' };
export type CatalogPage = { items: Anime[]; page: number; pages: number };
export type PlaybackSource = { anime: Anime; episodes: Episode[]; voiceovers: Voiceover[] };

export interface AnimeProvider {
  readonly id: string;
  catalog(query: CatalogQuery): Promise<CatalogPage>;
  title(id: number): Promise<Anime | null>;
  playback(id: number): Promise<PlaybackSource | null>;
}
