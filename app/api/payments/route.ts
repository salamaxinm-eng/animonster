import {
  requireUser,
  sameOrigin,
  body,
  db,
  uid,
  now,
  json,
  fail,
  ApiError,
  runtime,
} from '@/lib/server/core';
import { paymentFetch, verifyPayment } from '@/lib/server/billing';
import { PLUS_PRICE } from '@/lib/server/plus';
export async function POST(r: Request) {
  try {
    sameOrigin(r);
    const u = await requireUser(r),
      b = await body(r);
    if (u.identity.startsWith('preview:'))
      throw new ApiError(
        'Для оплаты войдите в аккаунт. Тестовый профиль не используется для покупок.',
        403,
      );
    if (b.action === 'check') {
      const order = await db()
        .prepare(
          'SELECT provider_id FROM orders WHERE user_id=? AND provider_id IS NOT NULL ORDER BY created_at DESC LIMIT 1',
        )
        .bind(u.id)
        .first<{ provider_id: string }>();
      if (!order) return json({ status: 'not_found' });
      return json({ status: await verifyPayment(order.provider_id) });
    }
    if (
      runtime().PAYMENTS_ENABLED !== 'true' ||
      !runtime().YOOKASSA_SHOP_ID ||
      !runtime().YOOKASSA_SECRET_KEY
    )
      throw new ApiError(
        'Оплата пока не подключена. Деньги не списываются.',
        503,
      );
    const existing = await db()
      .prepare(
        'SELECT id FROM orders WHERE user_id=? AND status=? AND created_at>? ORDER BY created_at DESC LIMIT 1',
      )
      .bind(u.id, 'pending', now() - 3600000)
      .first<{ id: string }>();
    const id = existing?.id || uid();
    if (!existing)
      await db()
        .prepare('INSERT INTO orders(id,user_id,created_at) VALUES (?,?,?)')
        .bind(id, u.id, now())
        .run();
    const p = await paymentFetch('payments', {
      method: 'POST',
      headers: { 'Idempotence-Key': id },
      body: JSON.stringify({
        amount: { value: PLUS_PRICE, currency: 'RUB' },
        capture: true,
        confirmation: {
          type: 'redirect',
          return_url: `${runtime().SITE_URL || new URL(r.url).origin}/profile?payment=return`,
        },
        description: 'AniMonster Plus — 1 месяц',
        metadata: { order_id: id, user_id: u.id },
      }),
    });
    await db()
      .prepare('UPDATE orders SET provider_id=? WHERE id=?')
      .bind(p.id, id)
      .run();
    if (!p.confirmation?.confirmation_url)
      throw new ApiError('Не получена ссылка на оплату', 502);
    return json({ confirmation_url: p.confirmation.confirmation_url });
  } catch (e) {
    return fail(e);
  }
}
