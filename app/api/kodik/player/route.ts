import {
  ApiError,
  db,
  fail,
  now,
  premium,
  viewer,
} from '@/lib/server/core';
import { safeKodikPlayerUrl } from '@/lib/server/kodik';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const animeId = Number(params.get('anime_id'));
    const translationId = Number(params.get('translation'));
    const episode = Number(params.get('episode'));
    if (
      !Number.isInteger(animeId) ||
      animeId < 1 ||
      !Number.isInteger(translationId) ||
      translationId < 1 ||
      !Number.isInteger(episode) ||
      episode < 1
    )
      throw new ApiError('Некорректный источник', 400);
    const user = await viewer(request);
    const access = await db()
      .prepare(
        'SELECT free_at FROM anime_episode_availability WHERE anime_id=? AND episode=?',
      )
      .bind(animeId, episode)
      .first<{ free_at: number }>();
    if (access && Number(access.free_at) > now()) {
      if (!user || (await premium(user.id)) <= now())
        throw new ApiError('Серия доступна по AniMonster Plus', 403);
    }
    const exact = await db()
      .prepare(
        'SELECT player_url FROM kodik_episode_links WHERE anime_id=? AND translation_id=? AND episode=?',
      )
      .bind(animeId, translationId, episode)
      .first<{ player_url: string }>();
    const source = exact
      ? { player_url: exact.player_url, episodes_count: episode }
      : await db()
          .prepare(
            `SELECT player_url,episodes_count FROM anime_sources
             WHERE provider='kodik' AND anime_id=? AND translation_id=? AND active=1
             ORDER BY episodes_count DESC,last_seen_at DESC LIMIT 1`,
          )
          .bind(animeId, translationId)
          .first<{ player_url: string; episodes_count: number }>();
    if (!source || episode > Number(source.episodes_count || 0))
      throw new ApiError('Серия временно недоступна', 404);
    const safe = safeKodikPlayerUrl(source.player_url);
    if (!safe) throw new ApiError('Источник временно недоступен', 502);
    const target = new URL(safe);
    target.searchParams.set('episode', String(episode));
    const start = Math.floor(Number(params.get('start_from')) || 0);
    if (start > 0 && start < 24 * 60 * 60)
      target.searchParams.set('start_from', String(start));
    return Response.redirect(target.href, 302);
  } catch (error) {
    return fail(error);
  }
}
