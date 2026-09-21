import {
  requireUser,
  sameOrigin,
  body,
  db,
  uid,
  now,
  json,
  fail,
  ApiError,
  runtime,
} from '@/lib/server/core';
import { paymentFetch, verifyPayment } from '@/lib/server/billing';
import {
  SUPPORT_PLAN,
  subscriptionPlan,
  supportAmount,
} from '@/lib/subscription-plans';
export async function POST(r: Request) {
  try {
    sameOrigin(r);
    const u = await requireUser(r),
      b = await body(r);
    if (u.identity.startsWith('preview:'))
      throw new ApiError(
        'Для оплаты войдите в аккаунт. Тестовый профиль не используется для покупок.',
        403,
      );
    if (b.action === 'check') {
      const order = await db()
        .prepare(
          'SELECT provider_id FROM orders WHERE provider=? AND user_id=? AND provider_id IS NOT NULL ORDER BY created_at DESC LIMIT 1',
        )
        .bind('platega', u.id)
        .first<{ provider_id: string }>();
      if (!order) return json({ status: 'not_found' });
      return json({ status: await verifyPayment(order.provider_id) });
    }
    if (
      runtime().PAYMENTS_ENABLED !== 'true' ||
      !runtime().PLATEGA_MERCHANT_ID ||
      !runtime().PLATEGA_SECRET_KEY
    )
      throw new ApiError(
        'Оплата пока не подключена. Деньги не списываются.',
        503,
      );
    // Platega does not document an idempotency header for transaction creation.
    // Give each checkout a distinct order so independent successful payments
    // are never collapsed into one order/grant.
    const requestedPlan = b.plan ?? 'monthly';
    const fixedPlan = subscriptionPlan(requestedPlan);
    const chosenAmount =
      requestedPlan === SUPPORT_PLAN ? supportAmount(b.amount) : null;
    if (!fixedPlan && chosenAmount === null)
      throw new ApiError(
        requestedPlan === SUPPORT_PLAN
          ? 'Выберите целую сумму от 90 до 100 000 ₽'
          : 'Неизвестный тариф',
        400,
      );
    const plan = fixedPlan || {
      id: SUPPORT_PLAN,
      label: '30 дней · свой тариф',
      days: 30,
      price: chosenAmount!.toFixed(2),
    };
    const id = uid();
    await db()
      .prepare(
        'INSERT INTO orders(id,user_id,created_at,provider,plan,amount,duration_days) VALUES (?,?,?,?,?,?,?)',
      )
      .bind(id, u.id, now(), 'platega', plan.id, plan.price, plan.days)
      .run();
    const p = await paymentFetch('v2/transaction/process', {
      method: 'POST',
      body: JSON.stringify({
        paymentDetails: {
          amount: Number(plan.price),
          currency: 'RUB',
        },
        description:
          plan.id === SUPPORT_PLAN
            ? `Поддержка AniMonster · Plus на ${plan.days} дней`
            : `AniMonster Plus — ${plan.label}`,
        return: `${runtime().SITE_URL || new URL(r.url).origin}/pins?payment=return`,
        failedUrl: `${runtime().SITE_URL || new URL(r.url).origin}/pins?payment=failed`,
        payload: id,
        metadata: { userId: u.id },
      }),
    });
    const providerId = p.transactionId || p.id;
    await db()
      .prepare('UPDATE orders SET provider_id=? WHERE id=?')
      .bind(providerId || null, id)
      .run();
    const paymentUrl =
      (p as typeof p & { url?: string; redirect?: string }).url ||
      (p as typeof p & { redirect?: string }).redirect;
    if (!providerId || !paymentUrl)
      throw new ApiError('Не получена ссылка на оплату', 502);
    return json({ url: paymentUrl });
  } catch (e) {
    return fail(e);
  }
}
