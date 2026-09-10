import { json, fail, ApiError } from '@/lib/server/core';
import { verifyPayment } from '@/lib/server/billing';
export async function POST(r: Request) {
  try {
    const raw = await r.text();
    if (raw.length > 20000) throw new ApiError('Слишком большой запрос', 413);
    const b = JSON.parse(raw);
    if (b.event === 'payment.succeeded' || b.event === 'payment.canceled')
      await verifyPayment(String(b.object?.id || ''));
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
