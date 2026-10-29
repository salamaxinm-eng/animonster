import {
  ApiError,
  body,
  cookie,
  db,
  fail,
  hash,
  json,
  now,
  premium,
  requireUser,
  sameOrigin,
} from '@/lib/server/core';
import { ONE_PIECE_ID, validTimezone } from '@/lib/one-piece';
import { getAnime } from '@/lib/server/library';
import {
  cachedEpisodeDuration,
  kodikSourceHasEpisode,
  kodikTranslationId,
  onePieceSourceHasEpisode,
} from '@/lib/watch-progress';
import { titleBlocked } from '@/lib/server/title-restrictions';
import {
  startVerifiedWatch,
  recordVerifiedWatch,
} from '@/lib/server/verified-watch';

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await requireUser(request),
      input = await body(request),
      stamp = now();
    if (user.identity?.startsWith('preview:'))
      return json({
        token: null,
        notice: 'Тестовые просмотры не выдают достижения.',
      });
    const limit = await db()
      .prepare(`INSERT INTO auth_limits(key,attempts,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET
      attempts=CASE WHEN auth_limits.expires<=? THEN 1 ELSE auth_limits.attempts+1 END,
      expires=CASE WHEN auth_limits.expires<=? THEN excluded.expires ELSE auth_limits.expires END RETURNING attempts`)
      .bind('verified-watch:' + user.id, stamp + 60000, stamp, stamp)
      .first<{ attempts: number }>();
    if (Number(limit?.attempts) > 180)
      throw new ApiError('Слишком много событий просмотра', 429);
    const auth = await hash(
      cookie(request, 'am_session') || `preview:${user.id}`,
    );
    if (input.action !== 'start')
      return json(
        await recordVerifiedWatch(
          user.id,
          auth,
          String(input.token || ''),
          Number(input.seq),
          input.samples,
        ),
      );
    const episode = Number(input.episode),
      duration = Number(input.duration),
      timezone = validTimezone(input.timezone);
    if (
      Number(input.anime) !== ONE_PIECE_ID ||
      !Number.isSafeInteger(episode) ||
      episode < 1 ||
      episode > 10000 ||
      !['aniliberty', 'kodik'].includes(input.provider) ||
      !timezone
    )
      throw new ApiError('Некорректная серия');
    // A catalog's 24-minute fallback is not evidence of the actual duration.
    // Wait for real native metadata / authenticated-frame duration events.
    if (!Number.isFinite(duration) || duration < 600 || duration > 7200)
      return json({
        token: null,
        notice:
          'Прогресс просмотра недоступен: плеер пока не сообщил длительность серии.',
      });
    const data = await getAnime(ONE_PIECE_ID);
    if (!data || (await titleBlocked(request.headers, data.anime)))
      throw new ApiError('Тайтл недоступен', 404);
    const access = await db()
      .prepare(
        'SELECT free_at FROM anime_episode_availability WHERE anime_id=? AND episode=?',
      )
      .bind(ONE_PIECE_ID, episode)
      .first<{ free_at: number }>();
    if (
      access &&
      Number(access.free_at) > stamp &&
      (await premium(user.id)) <= stamp
    )
      throw new ApiError('Серия пока доступна по Plus', 403);
    const voiceover = String(input.voiceover || '').slice(0, 120);
    if (input.provider === 'kodik') {
      const translation = kodikTranslationId(voiceover);
      if (!translation) throw new ApiError('Неизвестная озвучка');
      const exact = await db()
        .prepare(
          'SELECT player_url FROM kodik_episode_links WHERE anime_id=? AND translation_id=? AND episode=?',
        )
        .bind(ONE_PIECE_ID, translation, episode)
        .first<{ player_url: string }>();
      const sources = (
        await db()
          .prepare(
            "SELECT payload,episodes_count FROM anime_sources WHERE anime_id=? AND provider='kodik' AND translation_id=? AND active=1",
          )
          .bind(ONE_PIECE_ID, translation)
          .all<{ payload: string; episodes_count: number }>()
      ).results;
      if (
        !exact &&
        !sources.some((source) =>
          kodikSourceHasEpisode(source.payload, source.episodes_count, episode),
        )
      )
        throw new ApiError('Серия недоступна', 404);
      if (
        !sources.some((source) =>
          onePieceSourceHasEpisode(source.payload, episode, exact?.player_url),
        )
      )
        return json({
          token: null,
          notice:
            'Прогресс просмотра недоступен: источник использует неподтверждённую нумерацию серий.',
        });
      // Sanity bounds, not a substitution for the player's actual duration.
      const nominal = cachedEpisodeDuration(data.episodes, episode);
      if (nominal && (duration < nominal * 0.65 || duration > nominal * 2.1))
        throw new ApiError('Длительность не соответствует серии');
    } else {
      const nativeDuration = cachedEpisodeDuration(data.episodes, episode);
      if (!nativeDuration || Math.abs(nativeDuration - duration) > 3)
        return json({
          token: null,
          notice:
            'Прогресс просмотра недоступен: длительность источника ещё не подтверждена.',
        });
    }
    return json(
      await startVerifiedWatch(user.id, auth, {
        episode,
        duration,
        timezone,
        provider: input.provider,
        voiceover,
        durationBasis:
          input.provider === 'kodik'
            ? 'kodik-duration-event'
            : 'native-catalog-metadata',
      }),
    );
  } catch (error) {
    return fail(error);
  }
}
