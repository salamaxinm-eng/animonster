import { db, now, premium } from './core';

export async function queueEpisodeNotifications(
  animeId: number,
  episodes: number[],
  access: Map<number, { firstSeenAt: number; freeAt: number }>,
) {
  if (!episodes.length) return 0;
  const subscribers = await db()
    .prepare(
      `SELECT s.user_id,s.created_at FROM telegram_subscriptions s
       WHERE s.anime_id=? AND (
         EXISTS(SELECT 1 FROM grants g WHERE g.user_id=s.user_id AND g.revoked_at IS NULL AND g.expires>?)
         OR (SELECT count(*) FROM telegram_subscriptions earlier
             WHERE earlier.user_id=s.user_id AND
             (earlier.created_at<s.created_at OR (earlier.created_at=s.created_at AND earlier.anime_id<=s.anime_id)))<=3
       )`,
    )
    .bind(animeId, now())
    .all<{ user_id: string }>();
  let queued = 0;
  for (const subscriber of subscribers.results) {
    const plus = await premium(subscriber.user_id);
    for (const episode of episodes) {
      const availableAt = plus ? now() : access.get(episode)?.freeAt || now();
      const result = await db()
        .prepare(
          `INSERT INTO telegram_deliveries(id,user_id,anime_id,episode,available_at,next_attempt_at)
           VALUES (?,?,?,?,?,?) ON CONFLICT(user_id,anime_id,episode) DO NOTHING`,
        )
        .bind(
          crypto.randomUUID(),
          subscriber.user_id,
          animeId,
          episode,
          availableAt,
          availableAt,
        )
        .run();
      queued += Number(result.meta?.changes || 0);
    }
  }
  return queued;
}
