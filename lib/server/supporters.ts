import { db, now } from './core';

export type SupporterLeader = {
  id: string;
  nick: string;
  amount: string | number;
  payments: number;
};

// Every confirmed purchase supports the project, regardless of tariff.
const paidOrders = "o.status='succeeded' AND NOT o.is_test AND u.deleted_at IS NULL";
const leaderId = `(SELECT o.user_id FROM orders o JOIN users u ON u.id=o.user_id
  WHERE ${paidOrders} GROUP BY o.user_id
  ORDER BY SUM(o.amount) DESC,MIN(o.created_at),o.user_id LIMIT 1)`;

export async function supporterLeaderboard(limit = 3) {
  const rows = await db()
    .prepare(
      `SELECT u.id,u.nick,COALESCE(SUM(o.amount),0) AS amount,COUNT(o.id)::integer AS payments
       FROM orders o JOIN users u ON u.id=o.user_id
       WHERE ${paidOrders}
       GROUP BY u.id,u.nick
       ORDER BY SUM(o.amount) DESC,MIN(o.created_at),u.id
       LIMIT ?`,
    )
    .bind(Math.max(1, Math.min(10, Math.floor(limit))))
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
      `DELETE FROM user_cosmetics
       WHERE (cosmetic_id='pin:champion-crown'
         OR (cosmetic_id IN ('tag:number-one','frame:champion-gold') AND source='purchase'))
         AND user_id IS DISTINCT FROM ${leaderId}`,
    ),
    db().prepare(
      `UPDATE users SET
         pin=CASE WHEN pin='champion-crown' THEN NULL ELSE pin END,
         tag=CASE WHEN tag='number-one' AND NOT EXISTS (
           SELECT 1 FROM user_cosmetics WHERE user_id=users.id AND cosmetic_id='tag:number-one'
         ) THEN NULL ELSE tag END,
         profile_frame=CASE WHEN profile_frame='champion-gold' AND NOT EXISTS (
           SELECT 1 FROM user_cosmetics WHERE user_id=users.id AND cosmetic_id='frame:champion-gold'
         ) THEN 'none' ELSE profile_frame END
       WHERE id IS DISTINCT FROM ${leaderId}
         AND (pin='champion-crown'
           OR (tag='number-one' AND NOT EXISTS (
             SELECT 1 FROM user_cosmetics WHERE user_id=users.id AND cosmetic_id='tag:number-one'))
           OR (profile_frame='champion-gold' AND NOT EXISTS (
             SELECT 1 FROM user_cosmetics WHERE user_id=users.id AND cosmetic_id='frame:champion-gold')))`,
    ),
    db().prepare(
      `UPDATE users SET pin='champion-crown'
       WHERE id=${leaderId}
         AND NOT EXISTS (SELECT 1 FROM user_cosmetics
           WHERE user_id=users.id AND cosmetic_id='pin:champion-crown')`,
    ),
    db()
      .prepare(
        `INSERT INTO user_cosmetics(user_id,cosmetic_id,unlocked_at,source,source_key,metadata)
         SELECT leader.user_id,reward.cosmetic_id,?,'purchase',
                'supporter-leader:' || reward.slug,
                jsonb_build_object('amount',leader.amount,'rank',1)
         FROM (
           SELECT o.user_id,SUM(o.amount) AS amount
           FROM orders o JOIN users u ON u.id=o.user_id
           WHERE ${paidOrders}
           GROUP BY o.user_id
           ORDER BY SUM(o.amount) DESC,MIN(o.created_at),o.user_id
           LIMIT 1
         ) leader
         CROSS JOIN (VALUES
           ('tag:number-one','number-one'),
           ('frame:champion-gold','champion-gold'),
           ('pin:champion-crown','champion-crown')
         ) reward(cosmetic_id,slug)
         ON CONFLICT(user_id,cosmetic_id) DO UPDATE SET
           unlocked_at=excluded.unlocked_at,source=excluded.source,
           source_key=excluded.source_key,metadata=excluded.metadata`,
      )
      .bind(now()),
  ]);
}
