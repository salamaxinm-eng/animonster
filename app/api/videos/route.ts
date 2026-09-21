import type { Anime, Episode } from '@/lib/anime';
import { cacheAnime, getAnime } from '@/lib/server/library';
import {
  liberty,
  normalize,
  available,
  findRelease,
  type Release,
} from '@/lib/server/anime';
import { ApiError, fail, json, viewer, premium } from '@/lib/server/core';
import { kodikVoiceovers } from '@/lib/server/kodik';
import { syncEpisodeAccess } from '@/lib/server/episode-access';

export async function GET(request: Request) {
  try {
    const currentUser = await viewer(request);
    const params = new URL(request.url).searchParams;
    const id = Number(params.get('id'));
    if (!Number.isInteger(id) || id < 1 || id > 999999999)
      throw new ApiError('Некорректный тайтл');
    const cached = await getAnime(id);
    let anime: Anime | undefined = cached?.anime;
    let releaseId = Number(params.get('release_id')) || anime?.release_id;
    if (
      releaseId &&
      (!Number.isInteger(releaseId) || releaseId < 1 || releaseId > 999999)
    )
      throw new ApiError('Некорректный релиз');
    if (!releaseId && !anime) releaseId = (await findRelease(id))?.id;

    if (releaseId) {
      try {
        const release: Release = await liberty('/anime/releases/' + releaseId);
        const normalized = normalize(release);
        if (normalized.id === id && available(release)) {
          anime = anime
            ? {
                ...normalized,
                ...anime,
                release_id: release.id,
                mal_id: normalized.mal_id || anime.mal_id,
                providers: [
                  ...new Set<'aniliberty' | 'kodik'>([
                    ...(anime.providers || []),
                    'aniliberty',
                  ]),
                ],
              }
            : normalized;
          await cacheAnime(anime!, release.episodes);
        }
      } catch (error) {
        if (!anime)
          console.error(
            'AniLiberty metadata failed',
            error instanceof Error ? error.message : 'unknown',
          );
      }
    }
    if (!anime)
      return json({
        episodes: [],
        message: 'Этого аниме пока нет у подключённых источников.',
      });
    if (anime.is_adult && !currentUser?.adult_confirmed_at)
      throw new ApiError(
        'Подтвердите совершеннолетие в аккаунте.',
        403,
        'adult_confirmation_required',
      );

    const kodik = await kodikVoiceovers(anime);
    if (!kodik.voiceovers.length)
      return json({
        episodes: [],
        anime,
        message:
          kodik.message ||
          'Kodik пока не нашёл доступный плеер для этого аниме.',
        voiceovers_status: kodik.status,
        voiceovers_message: kodik.message,
      });
    const kodikCount = Math.max(
      0,
      ...kodik.voiceovers.map((voiceover) => voiceover.episodes),
    );
    const cachedEpisodes = (() => {
      try {
        return JSON.parse(cached?.episodes || '[]') as {
          ordinal: number;
          duration: number;
        }[];
      } catch {
        return [];
      }
    })();
    const cachedByOrdinal = new Map(
      cachedEpisodes.map((episode) => [Number(episode.ordinal), episode]),
    );
    const episodeCount = Math.max(kodikCount);
    if (!episodeCount)
      return json({
        episodes: [],
        anime,
        message: 'Серии временно недоступны.',
        voiceovers_status: kodik.status,
        voiceovers_message: kodik.message,
      });
    const episodes: Episode[] = Array.from(
      { length: episodeCount },
      (_, index) => {
        const ordinal = index + 1;
        return {
          id: `kodik:${anime!.id}:${ordinal}`,
          ordinal,
          name: `Серия ${ordinal}`,
          duration: cachedByOrdinal.get(ordinal)?.duration || 24 * 60,
          hls_480: null,
          hls_720: null,
          hls_1080: null,
        };
      },
    );
    const access = await syncEpisodeAccess(
      anime.id,
      'kodik',
      episodes.map((episode) => episode.ordinal),
    );
    const premiumUntil = currentUser ? await premium(currentUser.id) : 0;
    const publicEpisodes = episodes.map((episode) => {
      const availability = access.get(episode.ordinal);
      const freeAt = availability?.freeAt || 0;
      const locked = freeAt > Date.now() && !premiumUntil;
      return {
        ...episode,
        free_at: freeAt,
        plus_locked: locked,
      };
    });
    return json({
      episodes: publicEpisodes,
      anime,
      source: 'Kodik',
      voiceovers: kodik.voiceovers,
      voiceovers_status: kodik.status,
      voiceovers_message: kodik.message,
    });
  } catch (error) {
    return fail(error);
  }
}
