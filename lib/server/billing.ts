import { db, runtime, ApiError, now } from './core';
export async function paymentFetch(path: string, init: RequestInit = {}) {
  const e = runtime();
  if (
    e.PAYMENTS_ENABLED !== 'true' ||
    !e.YOOKASSA_SHOP_ID ||
    !e.YOOKASSA_SECRET_KEY
  )
    throw new ApiError(
      'Оплата пока не подключена. Деньги не списываются.',
      503,
    );
  const r = await fetch('https://api.yookassa.ru/v3/' + path, {
    ...init,
    headers: {
      Authorization:
        'Basic ' + btoa(e.YOOKASSA_SHOP_ID + ':' + e.YOOKASSA_SECRET_KEY),
      'Content-Type': 'application/json',
      ...init.headers,
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new ApiError('Платёжный сервис временно недоступен', 502);
  return (await r.json()) as {
    id: string;
    status: string;
    paid: boolean;
    test?: boolean;
    amount: { value: string; currency: string };
    metadata?: { order_id?: string; user_id?: string };
    confirmation?: { confirmation_url?: string; confirmation_token?: string };
  };
}
export async function verifyPayment(providerId: string) {
  if (!/^[a-zA-Z0-9-]{10,80}$/.test(providerId))
    throw new ApiError('Некорректный платёж');
  const p = await paymentFetch('payments/' + providerId);
  const order = await db()
    .prepare('SELECT * FROM orders WHERE id=?')
    .bind(p.metadata?.order_id || '')
    .first<{ id: string; user_id: string; provider_id: string | null }>();
  if (
    !order ||
    p.metadata?.user_id !== order.user_id ||
    p.amount.value !== '89.00' ||
    p.amount.currency !== 'RUB' ||
    p.test
  )
    throw new ApiError('Платёж не подтверждён', 400);
  if (order.provider_id && order.provider_id !== p.id)
    throw new ApiError('Платёж не совпадает', 400);
  if (p.status === 'succeeded' && p.paid) {
    await db().batch([
      db()
        .prepare('UPDATE orders SET status=?,provider_id=? WHERE id=?')
        .bind('succeeded', p.id, order.id),
      db()
        .prepare(
          "INSERT OR IGNORE INTO grants(order_id,user_id,starts_at,expires) SELECT ?,?,?,CAST(strftime('%s',datetime(MAX(?,COALESCE((SELECT MAX(expires) FROM grants WHERE user_id=?),0))/1000,'unixepoch','+1 month')) AS INTEGER)*1000",
        )
        .bind(order.id, order.user_id, now(), now(), order.user_id),
    ]);
  } else if (p.status === 'canceled') {
    await db()
      .prepare('UPDATE orders SET status=? WHERE id=?')
      .bind('canceled', order.id)
      .run();
  }
  return p.status;
}
