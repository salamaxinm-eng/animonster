import { timingSafeEqual } from 'node:crypto';
import { ApiError, fail, json, runtime } from '@/lib/server/core';
import { verifyPayment } from '@/lib/server/billing';

function safeEqual(received: string | null, expected: string | undefined) {
  if (!received || !expected) return false;
  const left = Buffer.from(received), right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  try {
    const config = runtime();
    if (!safeEqual(request.headers.get('x-api-key'), config.CASHERA_API_KEY) ||
        !safeEqual(request.headers.get('x-secret'), config.CASHERA_API_SECRET))
      throw new ApiError('Недействительные данные callback', 401);
    const raw = await request.text();
    if (raw.length > 20000) throw new ApiError('Слишком большой запрос', 413);
    let event;
    try { event = JSON.parse(raw); }
    catch { throw new ApiError('Некорректный callback', 400); }
    if (!event || typeof event !== 'object') throw new ApiError('Некорректный callback', 400);
    // Cashera requires acknowledging test and future event types without granting anything.
    if (event.event !== 'transaction.status_updated') return json({ ok: true });
    const id = event.transaction?.uuid;
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id))
      throw new ApiError('Некорректный платёж', 400);
    // Fetch current state with our own API credentials, including amount, currency and order ID.
    // Duplicate/delayed notifications therefore cannot replay an older paid state after a refund.
    await verifyPayment(id, 'cashera');
    return json({ ok: true });
  } catch (error) { return fail(error); }
}
