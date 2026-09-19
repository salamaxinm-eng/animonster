import {
  db,
  body,
  sameOrigin,
  now,
  uid,
  json,
  fail,
  ApiError,
  viewer,
} from '@/lib/server/core';
import { actor } from '../activity/route';
import { getAnime } from '@/lib/server/library';
import { markRecommendationsDirty } from '@/lib/server/recommendations/repository';
import { evaluateUserAchievements } from '@/lib/server/achievements';

const WATCHED_EPISODE_SECONDS = 12 * 60;

export async function GET(r: Request) {
  try {
    const u = await viewer(r);

    if (!u) return json([]);

    const id = Number(new URL(r.url).searchParams.get('anime'));

    return json(
      (
        await db()
          .prepare(
            'SELECT * FROM history WHERE user_id=? AND anime_id=? ORDER BY updated_at DESC',
          )
          .bind(u.id, id)
          .all()
      ).results,
    );
  } catch (e) {
    return fail(e);
  }
}

export async function POST(r: Request) {
  try {
    sameOrigin(r);

    const b = await body(r),
      a = await actor(r),
      n = now(),
      day = new Date(n).toISOString().slice(0, 10);

    if (b.action === 'start') {
      const id = Number(b.anime_id),
        ep = Number(b.episode),
        provider = b.provider === 'kodik' ? 'kodik' : 'aniliberty',
        voiceover = String(b.voiceover || provider).slice(0, 120);

      if (!Number.isInteger(id) || id < 1 || !Number.isInteger(ep) || ep < 1) {
        throw new ApiError('Некорректная серия');
      }

      const meta = await getAnime(id);

      const episode =
        meta &&
        (
          JSON.parse(meta.episodes) as {
            ordinal: number;
            duration: number;
          }[]
        ).find((e) => e.ordinal === ep);

      if (!episode || !episode.duration) {
        throw new ApiError('Серия недоступна', 404);
      }

      const token = uid();
      const previous = a.user
        ? await db()
            .prepare(
              'SELECT watched_seconds FROM history WHERE user_id=? AND anime_id=? AND episode=?',
            )
            .bind(a.user.id, id, ep)
            .first<{ watched_seconds: number }>()
        : null;

      await db().batch([
        db()
          .prepare('DELETE FROM watch_sessions WHERE expires<? OR actor=?')
          .bind(n, a.key),

        db()
          .prepare(
            'INSERT INTO watch_sessions(token,actor,user_id,anime_id,episode,duration,last_at,watched,expires,provider,voiceover) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
          )
          .bind(
            token,
            a.key,
            a.user?.id || null,
            id,
            ep,
            episode.duration,
            n,
            Math.min(episode.duration, Number(previous?.watched_seconds || 0)),
            n + 14400000,
            provider,
            voiceover,
          ),
      ]);
      if (a.user) await markRecommendationsDirty(a.user.id, n);

      const response = json({ token });

      response.headers.set(
        'Set-Cookie',
        `am_visitor=${a.visitor}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${
          new URL(r.url).protocol === 'https:' ? '; Secure' : ''
        }`,
      );

      return response;
    }

    const s = await db()
      .prepare(
        'SELECT * FROM watch_sessions WHERE token=? AND actor=? AND expires>?',
      )
      .bind(String(b.token || ''), a.key, n)
      .first<{
        anime_id: number;
        episode: number;
        duration: number;
        last_at: number;
        watched: number;
        user_id: string | null;
        provider: string;
        voiceover: string;
      }>();

    if (!s) {
      throw new ApiError('Сессия просмотра истекла', 409);
    }

    const elapsed = Math.max(
        0,
        Math.min(30, Math.floor((n - s.last_at) / 1000)),
      ),
      delta = Math.max(
        0,
        Math.min(elapsed, Math.floor(Number(b.seconds) || 0)),
      );

    const position = Math.max(
      0,
      Math.min(s.duration, Math.floor(Number(b.position) || 0)),
    );

    const won = await db()
      .prepare(
        'UPDATE watch_sessions SET last_at=?,watched=watched+? WHERE token=? AND last_at=? RETURNING token',
      )
      .bind(n, delta, b.token, s.last_at)
      .first();

    if (!won) {
      return json({ ok: true });
    }

    const stmts = [
      db()
        .prepare('INSERT OR IGNORE INTO daily_activity(day,actor) VALUES (?,?)')
        .bind(day, a.key),
    ];

    if (s.watched + delta >= 30) {
      stmts.push(
        db()
          .prepare(
            'INSERT OR IGNORE INTO daily_views(day,actor,anime_id,episode) VALUES (?,?,?,?)',
          )
          .bind(day, a.key, s.anime_id, s.episode),
      );
    }

    if (a.user) {
      stmts.push(
        db()
          .prepare(
            'INSERT INTO history(user_id,anime_id,episode,voiceover,position,duration,watched_seconds,completed,updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,anime_id,episode) DO UPDATE SET voiceover=excluded.voiceover,position=excluded.position,watched_seconds=LEAST(history.duration,history.watched_seconds+excluded.watched_seconds),completed=GREATEST(history.completed,CASE WHEN history.watched_seconds+excluded.watched_seconds>=? THEN 1 ELSE 0 END),updated_at=excluded.updated_at',
          )
          .bind(
            a.user.id,
            s.anime_id,
            s.episode,
            s.voiceover || s.provider,
            position,
            s.duration,
            delta,
            delta >= WATCHED_EPISODE_SECONDS ? 1 : 0,
            n,
            WATCHED_EPISODE_SECONDS,
          ),
      );
    }

    await db().batch(stmts);

    if (
      a.user &&
      delta > 0 &&
      s.watched < WATCHED_EPISODE_SECONDS &&
      s.watched + delta >= WATCHED_EPISODE_SECONDS
    )
      await evaluateUserAchievements(a.user.id, s.anime_id);

    const nextWatched = s.watched + delta;
    const recommendationThresholds = [
      30,
      Math.floor(s.duration * 0.5),
      Math.floor(s.duration * 0.9),
      WATCHED_EPISODE_SECONDS,
    ];
    if (
      a.user &&
      recommendationThresholds.some(
        (threshold) =>
          threshold > 0 && s.watched < threshold && nextWatched >= threshold,
      )
    )
      await markRecommendationsDirty(a.user.id, n);

    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
