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
        ep = Number(b.episode);
      if (!Number.isInteger(id) || id < 1 || !Number.isInteger(ep) || ep < 1)
        throw new ApiError('Некорректная серия');
      const meta = await getAnime(id);
      const episode =
        meta &&
        (
          JSON.parse(meta.episodes) as { ordinal: number; duration: number }[]
        ).find((e) => e.ordinal === ep);
      if (!episode || !episode.duration)
        throw new ApiError('Серия недоступна', 404);
      const token = uid();
      await db().batch([
        db()
          .prepare('DELETE FROM watch_sessions WHERE expires<? OR actor=?')
          .bind(n, a.key),
        db()
          .prepare(
            'INSERT INTO watch_sessions(token,actor,user_id,anime_id,episode,duration,last_at,expires) VALUES (?,?,?,?,?,?,?,?)',
          )
          .bind(
            token,
            a.key,
            a.user?.id || null,
            id,
            ep,
            episode.duration,
            n,
            n + 14400000,
          ),
      ]);
      const response = json({ token });
      response.headers.set(
        'Set-Cookie',
        `am_visitor=${a.visitor}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${new URL(r.url).protocol === 'https:' ? '; Secure' : ''}`,
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
      }>();
    if (!s) throw new ApiError('Сессия просмотра истекла', 409);
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
    if (!won) return json({ ok: true });
    const stmts = [
      db()
        .prepare('INSERT OR IGNORE INTO daily_activity(day,actor) VALUES (?,?)')
        .bind(day, a.key),
    ];
    if (s.watched + delta >= 30)
      stmts.push(
        db()
          .prepare(
            'INSERT OR IGNORE INTO daily_views(day,actor,anime_id,episode) VALUES (?,?,?,?)',
          )
          .bind(day, a.key, s.anime_id, s.episode),
      );
    if (a.user)
      stmts.push(
        db()
          .prepare(
            'INSERT INTO history(user_id,anime_id,episode,position,duration,watched_seconds,completed,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(user_id,anime_id,episode) DO UPDATE SET position=excluded.position,watched_seconds=MIN(history.duration,history.watched_seconds+excluded.watched_seconds),completed=MAX(history.completed,CASE WHEN history.watched_seconds+excluded.watched_seconds>=history.duration*0.8 AND excluded.position>=history.duration*0.9 THEN 1 ELSE 0 END),updated_at=excluded.updated_at',
          )
          .bind(
            a.user.id,
            s.anime_id,
            s.episode,
            position,
            s.duration,
            delta,
            delta >= s.duration * 0.8 && position >= s.duration * 0.9 ? 1 : 0,
            n,
          ),
      );
    await db().batch(stmts);
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
