import { db, now } from './core';

export type SupporterLeader = {
  id: string;
  nick: string;
  amount: string | number;
  payments: number;
};

export async function supporterLeaderboard() {
  const rows = await db()
    .prepare(
      `SELECT u.id,u.nick,COALESCE(SUM(o.amount),0) AS amount,COUNT(o.id)::integer AS payments
       FROM orders o JOIN users u ON u.id=o.user_id
       WHERE o.plan='support' AND o.status='succeeded' AND u.deleted_at IS NULL
       GROUP BY u.id,u.nick
       ORDER BY SUM(o.amount) DESC,MIN(o.created_at),u.id
       LIMIT 3`,
    )
    .all<SupporterLeader>();
  return rows.results.map((item) => ({
    ...item,
    amount: Number(item.amount),
    payments: Number(item.payments),
  }));
}

export async function refreshSupporterChampion() {
  await db().batch([
    db().prepare(
      "SELECT id FROM cosmetics WHERE id='tag:number-one' FOR UPDATE",
    ),
    db().prepare(
      "DELETE FROM user_cosmetics WHERE cosmetic_id='tag:number-one' AND source='purchase'",
    ),
    db()
      .prepare(
        `INSERT INTO user_cosmetics(user_id,cosmetic_id,unlocked_at,source,source_key,metadata)
         SELECT leader.user_id,'tag:number-one',?,'purchase','supporter-leader',
                jsonb_build_object('amount',leader.amount)
         FROM (
           SELECT o.user_id,SUM(o.amount) AS amount
           FROM orders o JOIN users u ON u.id=o.user_id
           WHERE o.plan='support' AND o.status='succeeded' AND u.deleted_at IS NULL
           GROUP BY o.user_id
           ORDER BY SUM(o.amount) DESC,MIN(o.created_at),o.user_id
           LIMIT 1
         ) leader
         ON CONFLICT(user_id,cosmetic_id) DO UPDATE SET
           unlocked_at=excluded.unlocked_at,source=excluded.source,
           source_key=excluded.source_key,metadata=excluded.metadata`,
      )
      .bind(now()),
  ]);
}
