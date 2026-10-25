import { db } from './core';

// Count actual server-accepted playback independently of lifetime history.
// A heartbeat crossing UTC midnight contributes to both days, never twice.
export async function recordDailyWatch(
  tx: ReturnType<typeof db>,
  actor: string,
  anime: number,
  episode: number,
  duration: number,
  seconds: number,
  timestamp: number,
) {
  let remaining = Math.max(0, Math.min(30, Math.floor(seconds)));
  let end = timestamp;
  while (remaining > 0) {
    const day = new Date(end - 1).toISOString().slice(0, 10);
    const midnight = Date.parse(day + 'T00:00:00Z');
    const part = Math.min(remaining, Math.ceil((end - midnight) / 1000));
    const row = await tx
      .prepare(`INSERT INTO daily_episode_watch(day,actor,anime_id,episode,seconds,last_at)
      VALUES (?,?,?,?,LEAST(?::integer,?::integer),?) ON CONFLICT(day,actor,anime_id,episode)
      DO UPDATE SET seconds=LEAST(?,daily_episode_watch.seconds+
        LEAST(excluded.seconds,GREATEST(0,(excluded.last_at-daily_episode_watch.last_at)/1000)::integer)),
        last_at=GREATEST(daily_episode_watch.last_at,excluded.last_at) RETURNING seconds`)
      .bind(day, actor, anime, episode, duration, part, end, duration)
      .first<{ seconds: number }>();
    if (Number(row?.seconds) >= 30)
      await tx
        .prepare(
          'INSERT OR IGNORE INTO daily_views(day,actor,anime_id,episode) VALUES (?,?,?,?)',
        )
        .bind(day, actor, anime, episode)
        .run();
    await tx
      .prepare('INSERT OR IGNORE INTO daily_activity(day,actor) VALUES (?,?)')
      .bind(day, actor)
      .run();
    remaining -= part;
    end = midnight;
  }
}
