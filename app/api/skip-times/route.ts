import type { Episode } from '@/lib/anime';
import { ApiError, fail, json } from '@/lib/server/core';
import {
  findRelease,
  liberty,
  normalize,
  type Release,
} from '@/lib/server/anime';
import { resolveSkipTimes } from '@/lib/server/skip-times';

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams,
      animeId = Number(params.get('anime_id')),
      episodeNumber = Number(params.get('episode')),
      duration = Number(params.get('duration')),
      provider = params.get('provider') === 'kodik' ? 'kodik' : 'aniliberty',
      voiceover = String(params.get('voiceover') || provider).slice(0, 100),
      requestedReleaseId = Number(params.get('release_id')) || undefined;
    const playbackDurationVerified = params.get('duration_verified') === 'true';
    if (!Number.isInteger(animeId) || animeId < 1 || animeId > 999999999)
      throw new ApiError('Некорректное аниме');
    if (
      !Number.isInteger(episodeNumber) ||
      episodeNumber < 1 ||
      episodeNumber > 100000
    )
      throw new ApiError('Некорректная серия');
    if (!Number.isFinite(duration) || duration < 60 || duration > 24 * 60 * 60)
      throw new ApiError('Некорректная длительность');

    let release: Release | undefined;
    try {
      const releaseId = requestedReleaseId || (await findRelease(animeId))?.id;
      if (releaseId) {
        const candidate: Release = await liberty(
          '/anime/releases/' + releaseId,
        );
        if ((candidate.shikimori?.id || 100000000 + candidate.id) === animeId)
          release = candidate;
      }
    } catch {}
    const episode = release?.episodes?.find(
      (item) => item.ordinal === episodeNumber,
    ) as Episode | undefined;
    const malId = release
      ? normalize(release).mal_id
      : animeId < 100000000
        ? animeId
        : undefined;
    return json(
      await resolveSkipTimes({
        animeId,
        malId,
        episode: episodeNumber,
        duration,
        provider,
        voiceover,
        libertyEpisode: episode,
        playbackDurationVerified,
      }),
    );
  } catch (error) {
    return fail(error);
  }
}
