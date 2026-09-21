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
import { mediaProxyEnabled, mediaProxyUrl } from '@/lib/server/media';
import { validSegment } from '@/lib/server/skip-times';
import { syncEpisodeAccess } from '@/lib/server/episode-access';

type NativeEpisode = Episode & { native: boolean };

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

    let nativeEpisodes: NativeEpisode[] = [];
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
          nativeEpisodes = (release.episodes || [])
            .filter((episode) =>
              Boolean(episode.hls_480 || episode.hls_720 || episode.hls_1080),
            )
            .map((episode) => ({
              id: episode.id,
              ordinal: episode.ordinal,
              name: episode.name || 'Серия ' + episode.ordinal,
              duration: episode.duration,
              opening: validSegment(episode.opening, episode.duration),
              ending: validSegment(episode.ending, episode.duration),
              hls_480: episode.hls_480,
              hls_720: episode.hls_720,
              hls_1080: episode.hls_1080,
              native: true,
            }))
            .sort((left, right) => left.ordinal - right.ordinal);
          await cacheAnime(anime!, release.episodes);
        }
      } catch (error) {
        if (!anime)
          console.error(
            'AniLiberty playback failed',
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
    const nativeByOrdinal = new Map(
      nativeEpisodes.map((episode) => [episode.ordinal, episode]),
    );
    const cachedByOrdinal = new Map(
      cachedEpisodes.map((episode) => [Number(episode.ordinal), episode]),
    );
    const episodeCount = Math.max(
      nativeEpisodes.at(-1)?.ordinal || 0,
      cachedEpisodes.at(-1)?.ordinal || 0,
      kodikCount,
      anime.episodes || 0,
    );
    if (!episodeCount)
      return json({
        episodes: [],
        anime,
        message: 'Серии временно недоступны.',
        voiceovers_status: kodik.status,
        voiceovers_message: kodik.message,
      });
    const episodes: NativeEpisode[] = Array.from(
      { length: episodeCount },
      (_, index) => {
        const ordinal = index + 1;
        const native = nativeByOrdinal.get(ordinal);
        if (native) return native;
        return {
          id: `kodik:${anime!.id}:${ordinal}`,
          ordinal,
          name: `Серия ${ordinal}`,
          duration: cachedByOrdinal.get(ordinal)?.duration || 24 * 60,
          hls_480: null,
          hls_720: null,
          hls_1080: null,
          native: false,
        };
      },
    );
    let access = await syncEpisodeAccess(
      anime.id,
      nativeEpisodes.length ? 'aniliberty' : 'kodik',
      episodes.map((episode) => episode.ordinal),
    );
    if (kodikCount)
      access = await syncEpisodeAccess(
        anime.id,
        'kodik',
        Array.from({ length: kodikCount }, (_, index) => index + 1),
      );
    const premiumUntil = currentUser ? await premium(currentUser.id) : 0;
    const proxiedEpisodes = await Promise.all(
      episodes.map(async (episode) => {
        const availability = access.get(episode.ordinal);
        const freeAt = availability?.freeAt || 0;
        const locked = freeAt > Date.now() && !premiumUntil;
        if (
          episode.native &&
          freeAt > Date.now() &&
          premiumUntil &&
          !mediaProxyEnabled()
        )
          throw new ApiError('Медиашлюз раннего доступа не настроен.', 503);
        const tokenAccess =
          freeAt > Date.now() ? { userId: currentUser?.id, freeAt } : undefined;
        const { native: _native, ...publicEpisode } = episode;
        return {
          ...publicEpisode,
          free_at: freeAt,
          plus_locked: locked,
          hls_480:
            !locked && episode.hls_480
              ? await mediaProxyUrl(episode.hls_480, undefined, tokenAccess)
              : null,
          hls_720:
            !locked && episode.hls_720
              ? await mediaProxyUrl(episode.hls_720, undefined, tokenAccess)
              : null,
          hls_1080:
            !locked && episode.hls_1080
              ? await mediaProxyUrl(episode.hls_1080, undefined, tokenAccess)
              : null,
        };
      }),
    );
    const anilibertyVoiceover = nativeEpisodes.length
      ? [
          {
            id: 'aniliberty',
            title: 'AniLiberty',
            provider: 'aniliberty' as const,
            translation_type: 'voice' as const,
            episodes: nativeEpisodes.length,
            episode_ordinals: nativeEpisodes.map((episode) => episode.ordinal),
          },
        ]
      : [];
    return json({
      episodes: proxiedEpisodes,
      anime,
      source: kodik.voiceovers.length ? 'Kodik' : 'AniLiberty',
      voiceovers: [...kodik.voiceovers, ...anilibertyVoiceover],
      voiceovers_status: kodik.status,
      voiceovers_message: kodik.message,
    });
  } catch (error) {
    return fail(error);
  }
}
