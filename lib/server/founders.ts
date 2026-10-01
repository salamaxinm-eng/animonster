import { db, now } from './core';

export const FOUNDER_MINIMUM_RUB = 1000;
export const FOUNDER_LIMIT = 10;

type Membership = {
  user_id: string;
  founder_number: number;
  payment_id: string;
  qualifying_amount: string | number;
  first_qualifying_payment_at: number;
};

export const founderLabel = (number: number) =>
  `#${String(number).padStart(3, '0')}`;

export function qualifiesForFounder(
  status: string,
  currency: string,
  amount: number,
) {
  return status === 'succeeded' && currency === 'RUB' &&
    Number.isFinite(amount) && amount >= FOUNDER_MINIMUM_RUB;
}

/** Assign only from a persisted, server-confirmed order. This transaction
 * rolls back the counter increment if a duplicate user/payment races it. */
export async function assignFounder(orderId: string) {
  return db().transaction(async (tx) => {
    const order = await tx.prepare(
      `SELECT o.id,o.user_id,o.amount,o.status,COALESCE(o.confirmed_at,o.created_at) AS qualifying_at
       FROM orders o JOIN users u ON u.id=o.user_id
       WHERE o.id=? AND o.provider='platega' AND u.deleted_at IS NULL
         AND NOT o.is_test AND u.identity NOT LIKE 'preview:%' AND u.identity NOT LIKE 'test:%'`,
    ).bind(orderId).first<{
      id: string; user_id: string; amount: string | number;
      status: string; qualifying_at: number;
    }>();
    if (!order || !qualifiesForFounder(order.status, 'RUB', Number(order.amount)))
      return null;
    const firstPayment = await tx.prepare(
      `SELECT id,amount,COALESCE(confirmed_at,created_at) AS qualifying_at
       FROM orders WHERE user_id=? AND status='succeeded' AND amount>=1000 AND NOT is_test
       ORDER BY COALESCE(confirmed_at,created_at),id LIMIT 1`,
    ).bind(order.user_id).first<{ id: string; amount: string | number; qualifying_at: number }>();
    if (!firstPayment) return null;
    const existing = await tx.prepare(
      'SELECT founder_number FROM founding_members WHERE user_id=?',
    ).bind(order.user_id).first<{ founder_number: number }>();
    if (existing) return existing.founder_number;
    const seat = await tx.prepare(
      'UPDATE founding_sequence SET next_number=next_number+1 WHERE id=1 AND backfilled AND next_number<=10 RETURNING next_number-1 AS founder_number',
    ).first<{ founder_number: number }>();
    if (!seat) return null;
    await tx.prepare(
      `INSERT INTO founding_members(user_id,founder_number,payment_id,qualifying_amount,
         first_qualifying_payment_at,created_at) VALUES (?,?,?,?,?,?)`,
    ).bind(order.user_id, seat.founder_number, firstPayment.id,
      firstPayment.amount, firstPayment.qualifying_at, now()).run();
    return seat.founder_number;
  });
}

export async function syncFounderRewards(userId: string) {
  const member = await db().prepare(
    'SELECT user_id,founder_number,payment_id,qualifying_amount,first_qualifying_payment_at FROM founding_members WHERE user_id=?',
  ).bind(userId).first<Membership>();
  if (!member) return false;
  const n = Number(member.founder_number);
  const pin = `pin:founder-${String(n).padStart(3, '0')}`;
  const expires = n === 1 ? 0 : (() => {
    const date = new Date(Number(member.first_qualifying_payment_at));
    date.setUTCMonth(date.getUTCMonth() + (n <= 3 ? 12 : 6));
    return date.getTime();
  })();
  const rewards = ['tag:founding-10', pin, 'frame:founder', 'background:founder'];
  await db().batch([
    ...rewards.map((cosmetic) => db().prepare(
      `INSERT INTO user_cosmetics(user_id,cosmetic_id,unlocked_at,source,source_key,metadata)
       VALUES (?,?,?,'founder',?,?::jsonb) ON CONFLICT(user_id,cosmetic_id) DO NOTHING`,
    ).bind(member.user_id, cosmetic, now(), `founder:${cosmetic}`,
      JSON.stringify({ founderNumber: n }))),
    db().prepare(
      `INSERT INTO grants(order_id,user_id,starts_at,expires,reason,lifetime)
       VALUES (?,?,?,?,?,?) ON CONFLICT(order_id) DO NOTHING`,
    ).bind(`founder:${n}`, member.user_id, Number(member.first_qualifying_payment_at),
      expires, `Founder ${founderLabel(n)}`, n === 1),
    db().prepare(
      `UPDATE users SET tag=COALESCE(tag,'founding-10'),pin=COALESCE(pin,?),
         profile_frame=CASE WHEN profile_frame='none' THEN 'founder' ELSE profile_frame END,
         profile_background=COALESCE(profile_background,'/rewards/founder/background.svg')
       WHERE id=?`,
    ).bind(`founder-${String(n).padStart(3, '0')}`, member.user_id),
  ]);
  // AniMonster Cards has no inventory or packs yet. Add its grant here once
  // the card system exists; the membership is the durable integration key.
  return true;
}

export async function publicFounders(myUserId?: string) {
  const state = await db().prepare('SELECT backfilled FROM founding_sequence WHERE id=1')
    .first<{ backfilled: boolean }>();
  const rows = await db().prepare(
    `SELECT f.founder_number,f.first_qualifying_payment_at,
            CASE WHEN u.deleted_at IS NULL THEN u.nick ELSE 'Участник AniMonster' END AS nick,
            CASE WHEN u.deleted_at IS NULL THEN u.avatar ELSE 'moon' END AS avatar,u.id
     FROM founding_members f JOIN users u ON u.id=f.user_id
     ORDER BY f.founder_number`,
  ).all<{ founder_number: number; first_qualifying_payment_at: number;
    nick: string; avatar: string; id: string }>();
  return {
    founders: rows.results.map(({ id: _id, ...row }) => ({
      ...row, pin: `founder-${String(row.founder_number).padStart(3, '0')}`,
    })),
    remaining: state?.backfilled ? FOUNDER_LIMIT - rows.results.length : null,
    backfillPending: !state?.backfilled,
    myFounderNumber: myUserId
      ? rows.results.find((row) => row.id === myUserId)?.founder_number ?? null
      : null,
    minimumDonationRub: FOUNDER_MINIMUM_RUB,
  };
}
