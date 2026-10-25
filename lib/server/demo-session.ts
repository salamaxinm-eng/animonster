import { randomBytes } from 'node:crypto';
import { ApiError, db, now } from './core';
import { demoCatalog } from './player-demo';
import {
  validDemoProgress,
  type DemoProgress,
  type DemoRoom,
} from '../demo-session';

async function episodeFor(raw: unknown) {
  const catalog = await demoCatalog();
  const episode = catalog?.episodes.find((item) => item.number === Number(raw));
  if (!episode) throw new ApiError('Серия демо недоступна', 404);
  return episode;
}
export async function getDemoProgress(userId: string) {
  const result = await db()
    .prepare(
      'SELECT episode,position,voice,updated_at AS "updatedAt" FROM demo_playback_progress WHERE user_id=? ORDER BY updated_at DESC',
    )
    .bind(userId)
    .all<DemoProgress>();
  return result.results.map((item) => ({
    ...item,
    position: Number(item.position),
    updatedAt: Number(item.updatedAt),
  }));
}
export async function saveDemoProgress(userId: string, input: unknown) {
  if (!validDemoProgress(input) || input.updatedAt > now() + 60000)
    throw new ApiError('Некорректный прогресс');
  const episode = await episodeFor(input.episode);
  if (!episode.voices.some((voice) => voice.id === input.voice))
    throw new ApiError('Озвучка недоступна');
  const position = Math.min(input.position, episode.duration);
  await db()
    .prepare(`INSERT INTO demo_playback_progress(user_id,episode,position,voice,updated_at) VALUES (?,?,?,?,?)
    ON CONFLICT(user_id,episode) DO UPDATE SET position=excluded.position,voice=excluded.voice,updated_at=excluded.updated_at
    WHERE demo_playback_progress.updated_at<=excluded.updated_at`)
    .bind(
      userId,
      input.episode,
      position,
      input.voice,
      Math.min(now(), input.updatedAt),
    )
    .run();
  return { ok: true };
}
async function roomFor(code: string) {
  if (!/^[a-f0-9]{24}$/.test(code))
    throw new ApiError('Комната не найдена', 404);
  const room = await db()
    .prepare('SELECT * FROM demo_watch_rooms WHERE code=? AND expires_at>?')
    .bind(code, now())
    .first<DemoRoom>();
  if (!room) throw new ApiError('Комната завершена или не найдена', 404);
  return {
    ...room,
    position: Number(room.position),
    rate: Number(room.rate),
    updated_at: Number(room.updated_at),
    expires_at: Number(room.expires_at),
  };
}
async function requireMember(code: string, userId: string) {
  const room = await roomFor(code);
  const member = await db()
    .prepare(
      'SELECT user_id FROM demo_watch_members WHERE room_code=? AND user_id=?',
    )
    .bind(code, userId)
    .first();
  if (!member) throw new ApiError('Войдите в комнату', 403);
  return room;
}
export async function demoRoomSnapshot(code: string, userId: string) {
  const room = await requireMember(code, userId);
  const members = await db()
    .prepare(
      `SELECT m.user_id,u.nick,m.seen_at FROM demo_watch_members m JOIN users u ON u.id=m.user_id WHERE room_code=? ORDER BY m.seen_at DESC`,
    )
    .bind(code)
    .all<{ user_id: string; nick: string; seen_at: number }>();
  return {
    room,
    host: room.host_id === userId,
    serverTime: now(),
    members: members.results.map((m) => ({
      user_id: m.user_id,
      nick: m.nick,
      online: Number(m.seen_at) > now() - 45000,
    })),
  };
}
export async function changeDemoRoom(
  userId: string,
  input: Record<string, unknown>,
) {
  const action = String(input.action || '');
  if (action === 'create') {
    const episode = await episodeFor(input.episode);
    const code = randomBytes(12).toString('hex');
    await db().transaction(async (tx) => {
      await tx
        .prepare('SELECT id FROM users WHERE id=? FOR UPDATE')
        .bind(userId)
        .first();
      await tx
        .prepare('DELETE FROM demo_watch_rooms WHERE expires_at<=?')
        .bind(now())
        .run();
      const active = await tx
        .prepare(
          'SELECT count(*) AS count FROM demo_watch_rooms WHERE host_id=? AND expires_at>?',
        )
        .bind(userId, now())
        .first<{ count: number }>();
      if (Number(active?.count) >= 3)
        throw new ApiError('У вас уже есть три активные комнаты', 429);
      await tx
        .prepare(
          'INSERT INTO demo_watch_rooms(code,host_id,episode,position,updated_at,expires_at) VALUES (?,?,?,?,?,?)',
        )
        .bind(
          code,
          userId,
          episode.number,
          Math.min(episode.duration, Math.max(0, Number(input.position) || 0)),
          now(),
          now() + 12 * 3600000,
        )
        .run();
      await tx
        .prepare(
          'INSERT INTO demo_watch_members(room_code,user_id,seen_at) VALUES (?,?,?)',
        )
        .bind(code, userId, now())
        .run();
    });
    return demoRoomSnapshot(code, userId);
  }
  const code = String(input.code || '');
  if (action === 'join') {
    await roomFor(code);
    await db().transaction(async (tx) => {
      const room = await tx
        .prepare(
          'SELECT * FROM demo_watch_rooms WHERE code=? AND expires_at>? FOR UPDATE',
        )
        .bind(code, now())
        .first<DemoRoom>();
      if (!room) throw new ApiError('Комната завершена', 404);
      const members = await tx
        .prepare(
          'SELECT user_id FROM demo_watch_members WHERE room_code=? AND (seen_at>? OR user_id=? OR user_id=?)',
        )
        .bind(code, now() - 45000, userId, room.host_id)
        .all<{ user_id: string }>();
      if (
        members.results.length >= 10 &&
        !members.results.some((m) => m.user_id === userId)
      )
        throw new ApiError('В комнате уже 10 зрителей', 409);
      await tx
        .prepare(
          'DELETE FROM demo_watch_members WHERE room_code=? AND seen_at<? AND user_id<>?',
        )
        .bind(code, now() - 45000, room.host_id)
        .run();
      await tx
        .prepare(
          'INSERT INTO demo_watch_members(room_code,user_id,seen_at) VALUES (?,?,?) ON CONFLICT(room_code,user_id) DO UPDATE SET seen_at=excluded.seen_at',
        )
        .bind(code, userId, now())
        .run();
    });
    return demoRoomSnapshot(code, userId);
  }
  const room = await requireMember(code, userId);
  if (action === 'leave') {
    if (room.host_id === userId)
      await db()
        .prepare('DELETE FROM demo_watch_rooms WHERE code=?')
        .bind(code)
        .run();
    else
      await db()
        .prepare(
          'DELETE FROM demo_watch_members WHERE room_code=? AND user_id=?',
        )
        .bind(code, userId)
        .run();
    return { ok: true };
  }
  if (action === 'heartbeat') {
    await db()
      .prepare(
        'UPDATE demo_watch_members SET seen_at=? WHERE room_code=? AND user_id=?',
      )
      .bind(now(), code, userId)
      .run();
    return demoRoomSnapshot(code, userId);
  }
  if (action !== 'state' || room.host_id !== userId)
    throw new ApiError('Управлять просмотром может только ведущий', 403);
  const episode = await episodeFor(input.episode);
  const position = Number(input.position);
  const rate = Number(input.rate);
  if (
    !Number.isFinite(position) ||
    position < 0 ||
    position > episode.duration ||
    ![0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].includes(rate) ||
    typeof input.playing !== 'boolean'
  )
    throw new ApiError('Некорректное состояние плеера');
  if (Number(input.version) !== room.version)
    throw new ApiError('Состояние комнаты обновилось', 409);
  const updated = await db()
    .prepare(
      `UPDATE demo_watch_rooms SET episode=?,position=?,playing=?,rate=?,version=version+1,updated_at=? WHERE code=? AND version=? RETURNING code`,
    )
    .bind(
      episode.number,
      position,
      input.playing,
      rate,
      now(),
      code,
      room.version,
    )
    .first();
  if (!updated) throw new ApiError('Состояние комнаты обновилось', 409);
  return demoRoomSnapshot(code, userId);
}
