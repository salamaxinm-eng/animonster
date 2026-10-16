import { ApiError, runtime } from './core';

export type PaymentProvider = 'platega' | 'cashera';

// Switching new checkouts never changes the provider of existing orders.
export function paymentProvider(): PaymentProvider {
  const value = runtime().PAYMENTS_PROVIDER || 'platega';
  if (value !== 'platega' && value !== 'cashera') throw new ApiError('Неизвестный платёжный сервис', 503);
  return value;
}

export function paymentsReady() {
  const config = runtime();
  if (config.PAYMENTS_ENABLED !== 'true') return false;
  if (config.PAYMENTS_PROVIDER === 'cashera') return !!config.CASHERA_API_KEY && !!config.CASHERA_API_SECRET;
  return (!config.PAYMENTS_PROVIDER || config.PAYMENTS_PROVIDER === 'platega') &&
    !!config.PLATEGA_MERCHANT_ID && !!config.PLATEGA_SECRET_KEY;
}

export type CasheraTransaction = {
  uuid: string;
  external_id: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  payment_url?: string | null;
};

export async function casheraFetch(path: string, init: RequestInit = {}) {
  const config = runtime();
  // Verification remains available when new sales are disabled.
  if (!config.CASHERA_API_KEY || !config.CASHERA_API_SECRET)
    throw new ApiError('Cashera пока не подключена', 503);
  let response: Response;
  try {
    response = await fetch('https://api.cashera.cash/api/v1/integration/transactions' + path, {
      ...init,
      headers: { 'X-Api-Key': config.CASHERA_API_KEY, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
      redirect: 'error',
    });
  } catch {
    throw new ApiError('Не удалось связаться с платёжным сервисом. Проверьте оплату позже.', 502, 'payment_provider_uncertain');
  }
  if (!response.ok) {
    console.error('Cashera API error', response.status);
    if (response.status === 422) {
      const error = await response.json().catch(() => null) as { message?: unknown } | null;
      if (error?.message === 'No payment methods are available on checkout.')
        throw new ApiError('Оплата недоступна: в Cashera пока не подключены способы оплаты.', 503, 'payment_methods_unavailable');
    }
    throw new ApiError('Платёжный сервис временно недоступен', 502,
      response.status >= 500 ? 'payment_provider_uncertain' : 'payment_provider_rejected');
  }
  return await response.json() as CasheraTransaction;
}

export function casheraMatches(transaction: CasheraTransaction, orderId: string, amount: number) {
  return transaction.type === 'deposit' && typeof transaction.external_id === 'string' &&
    transaction.external_id.length > 0 && transaction.external_id === orderId &&
    typeof transaction.uuid === 'string' && /^[a-f0-9-]{36}$/i.test(transaction.uuid) &&
    Number.isSafeInteger(transaction.amount) && transaction.amount > 0 &&
    Number.isFinite(amount) && transaction.amount === Math.round(amount * 100) &&
    transaction.currency === 'RUB';
}

export async function createCasheraCheckout(input: {
  orderId: string; amount: number; description: string; origin: string;
  successUrl: string; failUrl: string; metadata: Record<string, string>;
}) {
  const payload = JSON.stringify({
    amount: Math.round(input.amount * 100), currency: 'RUB', external_id: input.orderId,
    description: input.description.slice(0, 255), metadata: input.metadata,
    callback_url: `${input.origin}/api/payments/cashera/webhook`,
    success_url: input.successUrl, fail_url: input.failUrl,
  });
  let transaction: CasheraTransaction;
  try {
    transaction = await casheraFetch('', { method: 'POST', body: payload });
  } catch (error) {
    // Validation/authentication failures are definite rejections, not lost responses.
    if (!(error instanceof ApiError) || error.code !== 'payment_provider_uncertain') throw error;
    // The provider may have accepted a request before its response was lost.
    // Recover that same order; never create a second transaction with a new ID.
    try { transaction = await casheraFetch('/by-external-id/' + encodeURIComponent(input.orderId)); }
    catch { throw error; }
  }
  if (!casheraMatches(transaction, input.orderId, input.amount) || !transaction.payment_url)
    throw new ApiError('Не получена корректная ссылка на оплату', 502);
  let url: URL;
  try { url = new URL(transaction.payment_url); }
  catch { throw new ApiError('Некорректная ссылка на оплату', 502); }
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new ApiError('Некорректная ссылка на оплату', 502);
  return { id: transaction.uuid, url: url.href };
}
