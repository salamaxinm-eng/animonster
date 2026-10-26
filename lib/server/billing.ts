import { db, runtime, ApiError, now } from './core';
import { casheraFetch, casheraMatches, createCasheraCheckout, paymentProvider, paymentsReady, type PaymentProvider } from './payment-gateway';
import { refreshSupporterChampion } from './supporters';
import { assignFounder, syncFounderRewards } from './founders';
import { settleNicknamePayment } from './nickname';
import { confirmPassPayment, revokePassPayment } from './battlepass-payment';
import { confirmBundlePayment, confirmVpnPayment, revokeBundlePayment, revokeVpnPayment } from './vpn';

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
  isTest?: boolean;
  test?: boolean;
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
  if (charged === null || expected === null || commission === null)
    return false;
  return (
    charged === expected ||
    (commission >= 0 && charged - commission === expected)
  );
}

export async function paymentFetch(path: string, init: RequestInit = {}) {
  const e = runtime();
  if (
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

export async function createCheckout(input: {
  provider: PaymentProvider; orderId: string; amount: number; description: string;
  origin: string; successUrl: string; failUrl: string; metadata: Record<string, string>;
}) {
  if (!paymentsReady() || input.provider !== paymentProvider())
    throw new ApiError('Оплата пока не подключена', 503);
  if (input.provider === 'cashera') return createCasheraCheckout(input);
  const p = await paymentFetch('v2/transaction/process', { method: 'POST', body: JSON.stringify({
    paymentDetails: { amount: input.amount, currency: 'RUB' }, description: input.description,
    return: input.successUrl, failedUrl: input.failUrl, payload: input.orderId, metadata: input.metadata,
  }) });
  const id = p.transactionId || p.id;
  const url = (p as typeof p & { url?: string; redirect?: string }).url || (p as typeof p & { redirect?: string }).redirect;
  if (!id || !url || new URL(url).protocol !== 'https:') throw new ApiError('Не получена ссылка на оплату', 502);
  return { id, url };
}

export async function verifyOrderPayment(order: { id: string; provider: string; provider_id: string | null }) {
  let id = order.provider_id;
  if (!id && order.provider === 'cashera') {
    const remote = await casheraFetch('/by-external-id/' + encodeURIComponent(order.id));
    if (remote.external_id !== order.id) throw new ApiError('Платёж не совпадает', 400);
    id = remote.uuid;
  }
  return id ? verifyPayment(id, order.provider) : 'pending';
}

// Provider is read from the stored order, never inferred from the currently active gateway.
export async function verifyPayment(providerId: string, provider: string = 'platega') {
  if (!/^[a-zA-Z0-9-]{10,100}$/.test(providerId))
    throw new ApiError('Некорректный платёж');
  if (provider !== 'platega' && provider !== 'cashera') throw new ApiError('Неизвестный платёжный сервис');
  let p: PlategaTransaction;
  if (provider === 'cashera') {
    const remote = await casheraFetch('/' + encodeURIComponent(providerId));
    if (!casheraMatches(remote, remote.external_id, remote.amount / 100) || remote.uuid !== providerId)
      throw new ApiError('Платёж не подтверждён', 400);
    const statuses: Record<string, string> = { paid: 'CONFIRMED', pending: 'PENDING',
      canceled: 'CANCELED', failed: 'CANCELED', expired: 'CANCELED',
      refunded: 'CHARGEBACKED', chargeback: 'CHARGEBACKED' };
    if (!statuses[remote.status]) throw new ApiError('Неизвестный статус платежа', 502);
    p = { id: remote.uuid, payload: remote.external_id, amount: remote.amount / 100,
      currency: remote.currency, status: statuses[remote.status] };
  } else p = await paymentFetch('transaction/' + encodeURIComponent(providerId));
  const paymentId = p.id || p.transactionId;
  const orderId = p.payload || p.externalId || '';
  const amount = Number(p.paymentDetails?.amount ?? p.amount);
  const commission = Number(p.comission ?? p.commission ?? 0);
  const currency = p.paymentDetails?.currency || p.currency;
  const order = await db()
    .prepare('SELECT * FROM orders WHERE id=? AND provider=?')
    .bind(orderId, provider)
    .first<{
      id: string;
      user_id: string;
      provider: string;
      provider_id: string | null;
      plan: 'monthly' | 'annual' | 'support' | 'donation' | 'vpn' | 'vpn_plus' | 'battlepass' | 'nickname';
      amount: string | number;
      duration_days: number;
    }>();
  if (
    !order ||
    !paymentId ||
    paymentId !== providerId ||
    !validPaymentAmount(amount, Number(order.amount), commission) ||
    currency !== 'RUB'
  )
    throw new ApiError('Платёж не подтверждён', 400);
  if (order.provider_id && order.provider_id !== paymentId)
    throw new ApiError('Платёж не совпадает', 400);
  if (order.plan === 'nickname') {
    if (['CONFIRMED','CANCELED','CHARGEBACKED'].includes(p.status || '')) {
      await settleNicknamePayment(order.id, paymentId, p.status === 'CONFIRMED' ? 'succeeded' : p.status === 'CHARGEBACKED' ? 'chargebacked' : 'canceled', p.isTest === true || p.test === true);
      await refreshSupporterChampion();
    }
    return (await db().prepare('SELECT status FROM orders WHERE id=?').bind(order.id).first<{status: string}>())?.status || 'pending';
  }
  if (order.plan === 'battlepass') {
    if (p.status === 'CONFIRMED') await confirmPassPayment(order.id, paymentId, p.isTest === true || p.test === true);
    else if (p.status === 'CANCELED' || p.status === 'CHARGEBACKED') await revokePassPayment(order.id, p.status === 'CHARGEBACKED' ? 'chargebacked' : 'canceled');
    return (await db().prepare('SELECT status FROM orders WHERE id=?').bind(order.id).first<{ status: string }>())?.status || 'pending';
  }
  if (order.plan === 'vpn' || order.plan === 'vpn_plus') {
    if (p.status === 'CONFIRMED')
      await (order.plan === 'vpn_plus' ? confirmBundlePayment : confirmVpnPayment)(
        order.id, order.user_id, paymentId, p.isTest === true || p.test === true);
    else if (p.status === 'CANCELED' || p.status === 'CHARGEBACKED')
      await (order.plan === 'vpn_plus' ? revokeBundlePayment : revokeVpnPayment)(order.id, order.user_id,
        p.status === 'CHARGEBACKED' ? 'chargebacked' : 'canceled');
    const saved = await db().prepare('SELECT status FROM orders WHERE id=?')
      .bind(order.id).first<{ status: string }>();
    return saved?.status || 'pending';
  }
  if (p.status === 'CONFIRMED') {
    await db().batch([
      // Serialize extensions for this account, including distinct concurrent orders.
      db()
        .prepare('SELECT id FROM users WHERE id=? FOR UPDATE')
        .bind(order.user_id),
      db()
        .prepare(
          "UPDATE orders SET status=?,provider_id=?,confirmed_at=COALESCE(confirmed_at,?),is_test=? WHERE id=? AND status<>'chargebacked'",
        )
        .bind('succeeded', paymentId, now(), p.isTest === true || p.test === true, order.id),
      db()
        .prepare(
          "INSERT INTO grants(order_id,user_id,starts_at,expires) SELECT ?,?,?,GREATEST(?,COALESCE((SELECT MAX(expires) FROM grants WHERE user_id=? AND revoked_at IS NULL),0))+? WHERE EXISTS(SELECT 1 FROM orders WHERE id=? AND status='succeeded' AND duration_days>0) ON CONFLICT(order_id) DO NOTHING",
        )
        .bind(
          order.id,
          order.user_id,
          now(),
          now(),
          order.user_id,
          Number(order.duration_days) * 86400000,
          order.id,
        ),
      ...(order.plan === 'annual'
        ? [
            db()
              .prepare(
                `INSERT INTO user_cosmetics(user_id,cosmetic_id,unlocked_at,source,source_key,metadata)
         SELECT ?,'tag:eternal-nakama',?,'purchase','annual-plus',jsonb_build_object('order_id',?::text)
         WHERE EXISTS(SELECT 1 FROM orders WHERE id=? AND status='succeeded')
         ON CONFLICT(user_id,cosmetic_id) DO NOTHING`,
              )
              .bind(order.user_id, now(), order.id, order.id),
          ]
        : []),
      db().prepare('SELECT grant_fundraising_reward(?)').bind(order.id),
    ]);
    try {
      if (Number(order.amount) >= 1000 && p.isTest !== true && p.test !== true) {
        await assignFounder(order.id);
        await syncFounderRewards(order.user_id);
      }
    } catch (error) {
      console.error('Founder reward synchronization failed', error);
    }
    try {
      await refreshSupporterChampion();
    } catch (error) {
      console.error('Supporter reward synchronization failed', error);
    }
  } else if (p.status === 'CANCELED' || p.status === 'CHARGEBACKED') {
    const status = p.status === 'CHARGEBACKED' ? 'chargebacked' : 'canceled';
    await db().batch([
      db()
        .prepare('SELECT id FROM users WHERE id=? FOR UPDATE')
        .bind(order.user_id),
      db()
        .prepare(
          "UPDATE orders SET status=? WHERE id=? AND (status NOT IN ('succeeded','chargebacked') OR ?='chargebacked')",
        )
        .bind(status, order.id, status),
      ...(p.status === 'CHARGEBACKED'
        ? [
            db()
              .prepare(
                'UPDATE grants SET revoked_at=? WHERE order_id=? AND revoked_at IS NULL',
              )
              .bind(now(), order.id),
            db()
              .prepare(`DELETE FROM user_cosmetics WHERE user_id=? AND cosmetic_id='tag:eternal-nakama' AND source='purchase'
              AND NOT EXISTS(SELECT 1 FROM orders WHERE user_id=? AND plan='annual' AND status='succeeded')`)
              .bind(order.user_id, order.user_id),
          ]
        : []),
    ]);
    if (p.status === 'CHARGEBACKED')
      await refreshSupporterChampion();
  }
  const saved = await db()
    .prepare('SELECT status FROM orders WHERE id=?')
    .bind(order.id)
    .first<{ status: string }>();
  return saved?.status || 'pending';
}
