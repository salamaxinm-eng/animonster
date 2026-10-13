import { ApiError, body, cookie, db, fail, hash, json, now, premium, requireUser, sameOrigin } from '@/lib/server/core';
import { recordPassWatch, startPassWatch } from '@/lib/server/battlepass';
import { requireBattlepassAccess } from '@/lib/server/battlepass-access';
import { getAnime } from '@/lib/server/library';
import { cachedEpisodeDuration, kodikSourceHasEpisode, kodikTranslationId } from '@/lib/watch-progress';
export async function POST(r: Request) {
  try {
    sameOrigin(r); const user = await requireUser(r), input = await body(r);
    requireBattlepassAccess(user);
    const authHash = await hash(cookie(r, 'am_session') || `preview:${user.id}`);
    if (input.action !== 'start') return json(await recordPassWatch(user.id, authHash, String(input.token), Number(input.seq), input.samples));
    const anime = Number(input.anime), episode = Number(input.episode);
    if (!Number.isSafeInteger(anime) || anime < 1 || !Number.isSafeInteger(episode) || episode < 1 || !['kodik','aniliberty'].includes(input.provider)) throw new ApiError('Некорректная серия');
    const data = await getAnime(anime);
    if (!data) throw new ApiError('Тайтл не найден', 404);
    const access = await db().prepare('SELECT free_at FROM anime_episode_availability WHERE anime_id=? AND episode=?').bind(anime, episode).first<{ free_at: number }>();
    if (access && Number(access.free_at) > now() && await premium(user.id) <= now()) throw new ApiError('Серия пока доступна по Plus', 403);
    const duration = cachedEpisodeDuration(data.episodes, episode);
    if (input.provider === 'kodik') {
      const translation = kodikTranslationId(String(input.voiceover));
      if (!translation) throw new ApiError('Неизвестная озвучка');
      const sources = (await db().prepare("SELECT payload,episodes_count FROM anime_sources WHERE anime_id=? AND provider='kodik' AND translation_id=? AND active=1").bind(anime, translation).all<{ payload: string; episodes_count: number }>()).results;
      if (!sources.some((s) => kodikSourceHasEpisode(s.payload, s.episodes_count, episode))) throw new ApiError('Серия недоступна', 404);
    } else if (!duration) throw new ApiError('Длительность серии ещё не известна', 409);
    let genres: string[] = [];
    genres = data.anime.genres || [];
    return json(await startPassWatch(user.id, authHash, { anime, episode, duration, genres: genres.filter((v) => typeof v === 'string') }));
  } catch (error) { return fail(error); }
}
