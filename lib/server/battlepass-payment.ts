import { ApiError, db, now, uid } from './core';
import { assertLive, findSeason, memberLock, claimInTransaction } from './battlepass';

export async function reservePassOrder(user: string, seasonId: string) {
  return db().transaction(async (tx) => {
    const season = await findSeason(seasonId, false, tx); assertLive(season);
    const member = await memberLock(tx, season.id, user);
    if (member.premium) throw new ApiError('Премиальная дорожка этого сезона уже открыта', 409);
    const old = await tx.prepare('SELECT state,order_id,payment_url FROM pass_purchases WHERE season_id=? AND user_id=?').bind(season.id, user).first<{ state: string; order_id: string; payment_url: string | null }>();
    if (old && old.state !== 'canceled') {
      if (old.state === 'pending' && old.payment_url) return { id: old.order_id, url: old.payment_url, season };
      throw new ApiError(old.state === 'review' ? 'Статус платежа проверяется. Новый платёж пока не создаётся.' : 'Платёж уже создаётся или доступ был отозван. Обратитесь в поддержку.', 409);
    }
    const id = uid(), time = now();
    await tx.prepare(`INSERT INTO orders(id,user_id,created_at,provider,plan,amount,duration_days,pass_season_id) VALUES (?,?,?,'platega','battlepass',?,0,?)`).bind(id, user, time, season.price, season.id).run();
    await tx.prepare(`INSERT INTO pass_purchases(season_id,user_id,order_id,state,created_at) VALUES (?,?,?,'pending',?) ON CONFLICT(season_id,user_id) DO UPDATE SET order_id=excluded.order_id,state='pending',payment_url=NULL,created_at=excluded.created_at`).bind(season.id, user, id, time).run();
    return { id, season };
  });
}

// Called ONLY after billing.verifyPayment has fetched and verified the provider transaction.
export async function confirmPassPayment(orderId: string, paymentId: string, test = false) {
  return db().transaction(async (tx) => {
    const order = await tx.prepare(`SELECT * FROM orders WHERE id=? AND plan='battlepass'`).bind(orderId).first<{ user_id: string; pass_season_id: string; amount: number; created_at: number; status: string }>();
    if (!order) throw new ApiError('Платёж пропуска не найден');
    const s = await findSeason(order.pass_season_id, false, tx);
    if (!s || Number(order.amount) !== Number(s.price) || Number(order.created_at) < Number(s.starts_at) || Number(order.created_at) >= Number(s.ends_at)) throw new ApiError('Платёж не соответствует сезону');
    const member = await memberLock(tx, s.id, order.user_id);
    const locked = await tx.prepare('SELECT status FROM orders WHERE id=? FOR UPDATE').bind(orderId).first<{ status: string }>();
    if (locked?.status === 'chargebacked') return;
    await tx.prepare(`UPDATE orders SET status='succeeded',provider_id=?,confirmed_at=COALESCE(confirmed_at,?),is_test=? WHERE id=?`).bind(paymentId, now(), test, orderId).run();
    // Test transactions are retained for audit but never unlock a paid track.
    if (test) return;
    await tx.prepare('UPDATE pass_members SET premium=true WHERE season_id=? AND user_id=?').bind(s.id, order.user_id).run();
    await tx.prepare(`UPDATE pass_purchases SET state='active' WHERE season_id=? AND user_id=?`).bind(s.id, order.user_id).run();
    // Covers purchases after reaching levels and confirmation after season settlement.
    await claimInTransaction(tx, s, order.user_id, { ...member, premium: true });
  });
}
export async function revokePassPayment(orderId: string, status: 'canceled' | 'chargebacked') {
  return db().transaction(async (tx) => {
    const order = await tx.prepare(`SELECT user_id,pass_season_id FROM orders WHERE id=? AND plan='battlepass'`).bind(orderId).first<{ user_id: string; pass_season_id: string }>();
    if (!order) return;
    await memberLock(tx, order.pass_season_id, order.user_id);
    const changed = await tx.prepare(`UPDATE orders SET status=? WHERE id=? AND (status NOT IN ('succeeded','chargebacked') OR ?='chargebacked') RETURNING id`).bind(status, orderId, status).first();
    if (!changed) return;
    await tx.prepare('UPDATE pass_purchases SET state=? WHERE order_id=?').bind(status, orderId).run();
    if (status === 'chargebacked') await tx.prepare(`UPDATE pass_members SET premium=false WHERE season_id=? AND user_id=? AND NOT EXISTS(SELECT 1 FROM orders WHERE user_id=? AND pass_season_id=? AND status='succeeded' AND is_test=false) AND NOT EXISTS(SELECT 1 FROM pass_audit WHERE season_id=pass_members.season_id AND target_user_id=pass_members.user_id AND action='grant_premium')`).bind(order.pass_season_id, order.user_id, order.user_id, order.pass_season_id).run();
  });
}
