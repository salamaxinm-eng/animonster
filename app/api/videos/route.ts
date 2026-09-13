import { cacheAnime } from '@/lib/server/library';
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
export async function GET(r: Request) {
  try {
    const currentUser = await viewer(r);
    const p = new URL(r.url).searchParams,
      id = Number(p.get('id'));
    if (!Number.isInteger(id) || id < 1 || id > 999999999)
      throw new ApiError('Некорректный тайтл');
    let releaseId = Number(p.get('release_id')) || undefined;
    if (
      releaseId &&
      (!Number.isInteger(releaseId) || releaseId < 1 || releaseId > 999999)
    )
      throw new ApiError('Некорректный релиз');
    if (!releaseId) {
      releaseId = (await findRelease(id))?.id;
    }
    if (!releaseId)
      return json({
        episodes: [],
        message: 'Этого аниме пока нет у подключённого источника.',
      });
    const release: Release = await liberty('/anime/releases/' + releaseId);
    if ((release.shikimori?.id || 100000000 + release.id) !== id)
      throw new ApiError('Релиз не совпадает с тайтлом');
    if (release.age_rating?.is_adult) {
      if (!currentUser?.adult_confirmed_at)
        throw new ApiError(
          'Подтвердите совершеннолетие в аккаунте.',
          403,
          'adult_confirmation_required',
        );
    }
    if (!available(release))
      return json({
        episodes: [],
        message: 'Источник ограничил доступ к этому аниме.',
      });
    const episodes = (release.episodes || [])
      .filter((e) => e.hls_480 || e.hls_720 || e.hls_1080)
      .map((e) => ({
        id: e.id,
        ordinal: e.ordinal,
        name: e.name || 'Серия ' + e.ordinal,
        duration: e.duration,
        opening: validSegment(e.opening, e.duration),
        ending: validSegment(e.ending, e.duration),
        hls_480: e.hls_480,
        hls_720: e.hls_720,
        hls_1080: e.hls_1080,
      }))
      .sort((a, b) => a.ordinal - b.ordinal);
    const anime = normalize(release);
    await cacheAnime(anime, release.episodes);
    const access = await syncEpisodeAccess(
      anime.id,
      'aniliberty',
      episodes.map((episode) => episode.ordinal),
    );
    const premiumUntil = currentUser ? await premium(currentUser.id) : 0;
    const kodik = await kodikVoiceovers(anime);
    const proxiedEpisodes = await Promise.all(
      episodes.map(async (episode) => {
        const availability = access.get(episode.ordinal),
          freeAt = availability?.freeAt || 0;
        const locked = freeAt > Date.now() && !premiumUntil;
        if (freeAt > Date.now() && premiumUntil && !mediaProxyEnabled())
          throw new ApiError('Медиашлюз раннего доступа не настроен.', 503);
        const tokenAccess =
          freeAt > Date.now() ? { userId: currentUser?.id, freeAt } : undefined;
        return {
          ...episode,
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
    return json({
      episodes: proxiedEpisodes,
      anime,
      source: 'AniLiberty',
      voiceovers: [
        {
          id: 'aniliberty',
          title: 'AniLiberty',
          provider: 'aniliberty',
          episodes: proxiedEpisodes.length,
        },
        ...(premiumUntil ||
        !proxiedEpisodes.some((episode) => episode.plus_locked)
          ? kodik.voiceovers
          : []),
      ],
      voiceovers_status: kodik.status,
    });
  } catch (e) {
    return fail(e);
  }
}
