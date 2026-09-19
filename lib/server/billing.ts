import { db, runtime, ApiError, now } from './core';
import { PLUS_DURATION_MS, PLUS_PRICE } from './plus';

type PlategaTransaction = {
  id?: string;
  transactionId?: string;
  status?: string;
  amount?: number;
  currency?: string;
  paymentDetails?: { amount?: number | string; currency?: string };
  comission?: number;
  commission?: number;
  payload?: string;
  externalId?: string;
};

function cents(value: number) {
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

export function validPaymentAmount(
  chargedAmount: number,
  expectedAmount: number,
  providerCommission = 0,
) {
  const charged = cents(chargedAmount);
  const expected = cents(expectedAmount);
  const commission = cents(providerCommission);
  if (charged === null || expected === null || commission === null) return false;
  return charged === expected || (commission >= 0 && charged - commission === expected);
}

export async function paymentFetch(path: string, init: RequestInit = {}) {
  const e = runtime();
  if (
    e.PAYMENTS_ENABLED !== 'true' ||
    !e.PLATEGA_MERCHANT_ID ||
    !e.PLATEGA_SECRET_KEY
  )
    throw new ApiError(
      'Оплата пока не подключена. Деньги не списываются.',
      503,
    );
  const r = await fetch('https://app.platega.io/' + path.replace(/^\/+/, ''), {
    ...init,
    headers: {
      'X-MerchantId': e.PLATEGA_MERCHANT_ID,
      'X-Secret': e.PLATEGA_SECRET_KEY,
      'Content-Type': 'application/json',
      ...init.headers,
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) {
    console.error('Platega API error', r.status);
    throw new ApiError('Платёжный сервис временно недоступен', 502);
  }
  return (await r.json()) as PlategaTransaction;
}

export async function verifyPayment(providerId: string) {
  if (!/^[a-zA-Z0-9-]{10,100}$/.test(providerId))
    throw new ApiError('Некорректный платёж');
  const p = await paymentFetch('transaction/' + encodeURIComponent(providerId));
  const paymentId = p.id || p.transactionId;
  const orderId = p.payload || p.externalId || '';
  const amount = Number(p.paymentDetails?.amount ?? p.amount);
  const commission = Number(p.comission ?? p.commission ?? 0);
  const currency = p.paymentDetails?.currency || p.currency;
  const order = await db()
    .prepare('SELECT * FROM orders WHERE id=? AND provider=?')
    .bind(orderId, 'platega')
    .first<{
      id: string;
      user_id: string;
      provider: string;
      provider_id: string | null;
    }>();
  if (
    !order ||
    !paymentId ||
    paymentId !== providerId ||
    !validPaymentAmount(amount, Number(PLUS_PRICE), commission) ||
    currency !== 'RUB'
  )
    throw new ApiError('Платёж не подтверждён', 400);
  if (order.provider_id && order.provider_id !== paymentId)
    throw new ApiError('Платёж не совпадает', 400);
  if (p.status === 'CONFIRMED') {
    await db().batch([
      db()
        .prepare('UPDATE orders SET status=?,provider_id=? WHERE id=?')
        .bind('succeeded', paymentId, order.id),
      db()
        .prepare(
          'INSERT OR IGNORE INTO grants(order_id,user_id,starts_at,expires) SELECT ?,?,?,GREATEST(?,COALESCE((SELECT MAX(expires) FROM grants WHERE user_id=? AND revoked_at IS NULL),0))+?',
        )
        .bind(
          order.id,
          order.user_id,
          now(),
          now(),
          order.user_id,
          PLUS_DURATION_MS,
        ),
    ]);
  } else if (p.status === 'CANCELED' || p.status === 'CHARGEBACKED') {
    const status = p.status === 'CHARGEBACKED' ? 'chargebacked' : 'canceled';
    await db().batch([
      db()
        .prepare('UPDATE orders SET status=? WHERE id=?')
        .bind(status, order.id),
      ...(p.status === 'CHARGEBACKED'
        ? [
            db()
              .prepare(
                'UPDATE grants SET revoked_at=? WHERE order_id=? AND revoked_at IS NULL',
              )
              .bind(now(), order.id),
          ]
        : []),
    ]);
  }
  return p.status?.toLowerCase() || 'unknown';
}
