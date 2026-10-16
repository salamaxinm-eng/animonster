import { paymentProvider, paymentsReady } from '@/lib/server/payment-gateway';
import { ApiError, body, db, fail, json, requireUser, runtime, sameOrigin } from '@/lib/server/core';
import { createCheckout, verifyOrderPayment } from '@/lib/server/billing';
import { reservePassOrder } from '@/lib/server/battlepass-payment';
import { requireBattlepassAccess } from '@/lib/server/battlepass-access';
export async function POST(r: Request) {
  try {
    sameOrigin(r); const user = await requireUser(r), input = await body(r), season = String(input.season || '');
    requireBattlepassAccess(user);
    if (user.identity.startsWith('preview:')) throw new ApiError('Для покупки войдите в обычный аккаунт', 403);
    if (input.action === 'check') {
      const order = await db().prepare("SELECT id,provider,provider_id FROM orders WHERE user_id=? AND plan='battlepass' AND pass_season_id=? AND (provider_id IS NOT NULL OR provider='cashera') ORDER BY created_at DESC LIMIT 1").bind(user.id, season).first<{ id: string; provider: string; provider_id: string | null }>();
      return json({ status: order ? await verifyOrderPayment(order) : 'not_found' });
    }
    const provider = paymentProvider();
    if (!paymentsReady()) throw new ApiError('Оплата пока не подключена', 503);
    const reservation = await reservePassOrder(user.id, season, provider);
    if ('url' in reservation) return json({ url: reservation.url });
    try {
      const origin = runtime().SITE_URL || new URL(r.url).origin;
      const { id, url } = await createCheckout({
        provider, orderId: reservation.id, amount: reservation.season.price, origin,
        description: `AniMonster Pass — ${reservation.season.title}. Дополнительные награды одного сезона. Без продления.`,
        successUrl: `${origin}/battlepass?season=${encodeURIComponent(season)}&payment=return`,
        failUrl: `${origin}/battlepass?season=${encodeURIComponent(season)}&payment=failed`,
        metadata: { userId: user.id, seasonId: season },
      });
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
