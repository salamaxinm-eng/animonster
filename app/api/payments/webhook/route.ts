import { json, fail, ApiError } from '@/lib/server/core';
import { verifyPayment } from '@/lib/server/billing';
import { runtime } from '@/lib/server/core';
import { timingSafeEqual } from 'node:crypto';

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(r: Request) {
  try {
    const config = runtime();
    const merchantId = r.headers.get('x-merchantid') || '';
    const secret = r.headers.get('x-secret') || '';
    if (
      !config.PLATEGA_MERCHANT_ID ||
      !config.PLATEGA_SECRET_KEY ||
      !safeEqual(merchantId, config.PLATEGA_MERCHANT_ID) ||
      !safeEqual(secret, config.PLATEGA_SECRET_KEY)
    )
      throw new ApiError('Недействительная подпись callback', 401);
    const raw = await r.text();
    if (raw.length > 20000) throw new ApiError('Слишком большой запрос', 413);
    const b = JSON.parse(raw);
    const id = String(b.id || b.Id || '');
    if (!id || typeof b.status !== 'string')
      throw new ApiError('Некорректный callback', 400);
    await verifyPayment(id);
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
