import { ApiError, body, db, fail, json, requireUser, runtime, sameOrigin } from '@/lib/server/core';
import { paymentFetch, verifyPayment } from '@/lib/server/billing';
import { reservePassOrder } from '@/lib/server/battlepass-payment';
export async function POST(r: Request) {
  try {
    sameOrigin(r); const user = await requireUser(r), input = await body(r), season = String(input.season || '');
    if (user.identity.startsWith('preview:')) throw new ApiError('Для покупки войдите в обычный аккаунт', 403);
    if (input.action === 'check') {
      const order = await db().prepare("SELECT provider_id FROM orders WHERE user_id=? AND plan='battlepass' AND pass_season_id=? AND provider_id IS NOT NULL ORDER BY created_at DESC LIMIT 1").bind(user.id, season).first<{ provider_id: string }>();
      return json({ status: order ? await verifyPayment(order.provider_id) : 'not_found' });
    }
    const env = runtime();
    if (env.PAYMENTS_ENABLED !== 'true' || !env.PLATEGA_MERCHANT_ID || !env.PLATEGA_SECRET_KEY) throw new ApiError('Оплата пока не подключена', 503);
    const reservation = await reservePassOrder(user.id, season);
    if ('url' in reservation) return json({ url: reservation.url });
    try {
      const origin = runtime().SITE_URL || new URL(r.url).origin;
      const p = await paymentFetch('v2/transaction/process', { method: 'POST', body: JSON.stringify({
        paymentDetails: { amount: reservation.season.price, currency: 'RUB' },
        description: `AniMonster Pass — ${reservation.season.title}. Дополнительные награды одного сезона. Без продления.`,
        return: `${origin}/battlepass?season=${encodeURIComponent(season)}&payment=return`,
        failedUrl: `${origin}/battlepass?season=${encodeURIComponent(season)}&payment=failed`, payload: reservation.id,
        metadata: { userId: user.id, seasonId: season },
      }) });
      const id = p.transactionId || p.id, url = (p as typeof p & { url?: string; redirect?: string }).url || (p as typeof p & { redirect?: string }).redirect;
      if (!id || !url || new URL(url).protocol !== 'https:') throw new Error('Платёжный сервис не вернул ссылку');
      await db().transaction(async (tx) => {
        await tx.prepare('UPDATE orders SET provider_id=? WHERE id=? AND (provider_id IS NULL OR provider_id=?)').bind(id, reservation.id, id).run();
        await tx.prepare('UPDATE pass_purchases SET payment_url=? WHERE order_id=?').bind(url, reservation.id).run();
      });
      return json({ url });
    } catch (error) {
      // A timeout can occur after the provider created a payment. Keep the reservation for reconciliation.
      await db().prepare("UPDATE pass_purchases SET state='review' WHERE order_id=? AND state='pending'").bind(reservation.id).run();
      throw error;
    }
  } catch (error) { return fail(error); }
}
