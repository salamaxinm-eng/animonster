import { ApiError, db, now, uid, type User } from './core';
import {
  NICKNAME_PRICE,
  validNicknameStyle,
  type NicknameStyle,
} from '../nickname-styles';
export function hasNicknameStudio(
  user: Pick<User, 'nickname_unlocked_at' | 'nickname_gift_at'>,
) {
  return (
    Number(user.nickname_gift_at) > 0 || Number(user.nickname_unlocked_at) > 0
  );
}
export function validateNicknameChoice(
  user: User,
  input: unknown,
): NicknameStyle | null {
  if (input == null) return null;
  if (!validNicknameStyle(input)) throw new ApiError('Неизвестный стиль ника');
  if (input.color === 'legend') {
    if (!Number(user.legend_origin_at))
      throw new ApiError('Это персональная награда', 403);
    return { color: 'legend', effect: 'shimmer', motion: input.motion };
  }
  if (input.color === 'default')
    return { color: 'default', effect: 'solid', motion: false };
  if (!hasNicknameStudio(user))
    throw new ApiError('Сначала откройте оформление ника', 403);
  return { color: input.color, effect: input.effect, motion: input.motion };
}
export async function reserveNicknameOrder(
  userId: string,
  provider: 'platega' | 'cashera',
) {
  return db().transaction(async (tx) => {
    const user = await tx
      .prepare('SELECT * FROM users WHERE id=? FOR UPDATE')
      .bind(userId)
      .first<User>();
    if (!user) throw new ApiError('Аккаунт не найден', 404);
    if (hasNicknameStudio(user))
      throw new ApiError('Оформление ника уже открыто навсегда', 409);
    const old = await tx
      .prepare('SELECT * FROM nickname_purchases WHERE user_id=?')
      .bind(userId)
      .first<{ state: string; order_id: string; payment_url: string | null }>();
    if (old && !['canceled', 'chargebacked'].includes(old.state)) {
      if (old.state === 'pending' && old.payment_url)
        return { id: old.order_id, url: old.payment_url };
      throw new ApiError(
        'Предыдущий платёж проверяется. Нажмите «Проверить оплату».',
        409,
      );
    }
    const id = uid(),
      time = now();
    await tx
      .prepare(
        "INSERT INTO orders(id,user_id,created_at,provider,plan,amount,duration_days) VALUES (?,?,?,?,'nickname',?,0)",
      )
      .bind(id, userId, time, provider, NICKNAME_PRICE)
      .run();
    await tx
      .prepare(`INSERT INTO nickname_purchases(user_id,order_id,state,created_at) VALUES (?,?,'pending',?)
      ON CONFLICT(user_id) DO UPDATE SET order_id=excluded.order_id,state='pending',payment_url=NULL,created_at=excluded.created_at`)
      .bind(userId, id, time)
      .run();
    return { id };
  });
}
// Only called after billing verifies the transaction ID, order, amount and currency with the provider.
export async function settleNicknamePayment(
  orderId: string,
  paymentId: string,
  status: 'succeeded' | 'canceled' | 'chargebacked',
  test = false,
) {
  await db().transaction(async (tx) => {
    const order = await tx
      .prepare(
        "SELECT user_id,amount FROM orders WHERE id=? AND plan='nickname'",
      )
      .bind(orderId)
      .first<{ user_id: string; amount: number }>();
    if (!order || Number(order.amount) !== NICKNAME_PRICE)
      throw new ApiError('Заказ оформления не найден');
    await tx
      .prepare('SELECT id FROM users WHERE id=? FOR UPDATE')
      .bind(order.user_id)
      .first();
    const locked = await tx
      .prepare('SELECT status FROM orders WHERE id=? FOR UPDATE')
      .bind(orderId)
      .first<{ status: string }>();
    if (
      locked?.status === 'chargebacked' ||
      (locked?.status === 'succeeded' && status === 'canceled')
    )
      return;
    await tx
      .prepare(
        `UPDATE orders SET status=?,provider_id=?,confirmed_at=CASE WHEN ?='succeeded' THEN COALESCE(confirmed_at,?) ELSE confirmed_at END,is_test=? WHERE id=?`,
      )
      .bind(status, paymentId, status, now(), test, orderId)
      .run();
    await tx
      .prepare('UPDATE nickname_purchases SET state=? WHERE order_id=?')
      .bind(
        test ? 'canceled' : status === 'succeeded' ? 'active' : status,
        orderId,
      )
      .run();
    // Persist an aggregate right; on refund keep any independently paid or gifted right.
    await tx
      .prepare(`UPDATE users SET nickname_unlocked_at=(SELECT MIN(confirmed_at) FROM orders
      WHERE user_id=? AND plan='nickname' AND status='succeeded' AND NOT is_test) WHERE id=?`)
      .bind(order.user_id, order.user_id)
      .run();
    await tx
      .prepare(`UPDATE users SET nickname_style=NULL WHERE id=? AND nickname_unlocked_at IS NULL AND nickname_gift_at IS NULL
      AND nickname_style->>'color' NOT IN ('default','legend')`)
      .bind(order.user_id)
      .run();
  });
}
