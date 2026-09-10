import { cacheAnime } from '@/lib/server/library';
import {
  liberty,
  normalize,
  available,
  findRelease,
  type Release,
} from '@/lib/server/anime';

import { ApiError, fail, json } from '@/lib/server/core';
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
    await cacheAnime(normalize(release), release.episodes);
    return json({ episodes, anime: normalize(release), source: 'AniLiberty' });
  } catch (e) {
    return fail(e);
  }
}
