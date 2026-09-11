import { cacheAnime } from '@/lib/server/library';
import {
  liberty,
  normalize,
  available,
  findRelease,
  type Release,
} from '@/lib/server/anime';

import { ApiError, fail, json, viewer } from '@/lib/server/core';
import { kodikVoiceovers } from '@/lib/server/kodik';
export async function GET(r: Request) {
  try {
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
      const user = await viewer(r);
      if (!user?.adult_confirmed_at)
        throw new ApiError('Подтвердите совершеннолетие в аккаунте.', 403, 'adult_confirmation_required');
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
        hls_480: e.hls_480,
        hls_720: e.hls_720,
        hls_1080: e.hls_1080,
      }))
      .sort((a, b) => a.ordinal - b.ordinal);
    const anime = normalize(release);
    await cacheAnime(anime, release.episodes);
    const kodik = await kodikVoiceovers(anime);
    return json({
      episodes,
      anime,
      source: 'AniLiberty',
      voiceovers: [
        {
          id: 'aniliberty',
          title: 'AniLiberty',
          provider: 'aniliberty',
          episodes: episodes.length,
        },
        ...kodik.voiceovers,
      ],
      voiceovers_status: kodik.status,
    });
  } catch (e) {
    return fail(e);
  }
}
