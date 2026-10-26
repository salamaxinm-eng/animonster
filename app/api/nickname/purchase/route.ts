import {
  ApiError,
  body,
  db,
  fail,
  json,
  requireUser,
  runtime,
  sameOrigin,
} from '@/lib/server/core';
import { paymentProvider, paymentsReady } from '@/lib/server/payment-gateway';
import { createCheckout, verifyOrderPayment } from '@/lib/server/billing';
import { reserveNicknameOrder } from '@/lib/server/nickname';
import { NICKNAME_PRICE } from '@/lib/nickname-styles';
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await requireUser(request),
      input = await body(request);
    if (user.identity.startsWith('preview:'))
      throw new ApiError('Для покупки войдите в обычный аккаунт', 403);
    if (input.action === 'check') {
      const order = await db()
        .prepare(`SELECT id,provider,provider_id FROM orders WHERE user_id=? AND plan='nickname'
        AND provider IN ('cashera','platega') AND (provider_id IS NOT NULL OR provider='cashera') ORDER BY created_at DESC,id DESC LIMIT 1`)
        .bind(user.id)
        .first<{ id: string; provider: string; provider_id: string | null }>();
      return json({
        status: order ? await verifyOrderPayment(order) : 'not_found',
      });
    }
    if (input.action !== 'buy') throw new ApiError('Неизвестное действие');
    if (!paymentsReady())
      throw new ApiError('Платёжный сервис временно недоступен', 503);
    const provider = paymentProvider(),
      reservation = await reserveNicknameOrder(user.id, provider);
    if ('url' in reservation) return json({ url: reservation.url });
    try {
      const origin = runtime().SITE_URL || new URL(request.url).origin;
      const checkout = await createCheckout({
        provider,
        orderId: reservation.id,
        amount: NICKNAME_PRICE,
        origin,
        description:
          'AniMonster — оформление ника: 20 цветов и 5 эффектов навсегда. Единоразовая покупка.',
        successUrl: `${origin}/profile?section=appearance&appearance=nickname&nicknamePayment=return`,
        failUrl: `${origin}/profile?section=appearance&appearance=nickname&nicknamePayment=failed`,
        metadata: { userId: user.id, product: 'nickname' },
      });
      await db().transaction(async (tx) => {
        await tx
          .prepare(
            'UPDATE orders SET provider_id=? WHERE id=? AND (provider_id IS NULL OR provider_id=?)',
          )
          .bind(checkout.id, reservation.id, checkout.id)
          .run();
        await tx
          .prepare(
            'UPDATE nickname_purchases SET payment_url=? WHERE order_id=?',
          )
          .bind(checkout.url, reservation.id)
          .run();
      });
      return json({ url: checkout.url });
    } catch (error) {
      // Never create a second charge after an uncertain provider timeout; reconciliation uses external ID.
      await db()
        .prepare(
          "UPDATE nickname_purchases SET state='review' WHERE order_id=? AND state='pending'",
        )
        .bind(reservation.id)
        .run();
      throw error;
    }
  } catch (error) {
    return fail(error);
  }
}
