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
import { requireActiveFundraisingGoal } from '@/lib/server/fundraising';
import { DONATION_PLAN, DONATION_MIN_AMOUNT, donationAmount } from '@/lib/fundraising';
import { VPN_PLAN, VPN_PLUS_PLAN } from '@/lib/vpn-plan';
import { vpnBundlePurchaseAvailable, vpnPurchaseAvailable } from '@/lib/server/vpn';
import { reservePromotion } from '@/lib/server/payment-promotions';
import {
  SUPPORT_MIN_AMOUNT,
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
      const checkPlan = b.plan === VPN_PLAN.id ? 'vpn' :
        b.plan === VPN_PLUS_PLAN.id ? 'vpn_plus' : 'plus';
      const order = await db()
        .prepare(
          `SELECT provider_id FROM orders WHERE provider=? AND user_id=?
           AND provider_id IS NOT NULL AND
           ((?='vpn' AND plan='vpn') OR (?='vpn_plus' AND plan='vpn_plus') OR
            (?='plus' AND plan NOT IN ('vpn','vpn_plus')))
           ORDER BY created_at DESC LIMIT 1`,
        )
        .bind('platega', u.id, checkPlan, checkPlan, checkPlan)
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
    if (requestedPlan === VPN_PLAN.id && !vpnPurchaseAvailable())
      throw new ApiError('Покупка VPN пока не открыта', 503);
    if (requestedPlan === VPN_PLUS_PLAN.id && !vpnBundlePurchaseAvailable())
      throw new ApiError('Комплект VPN + Plus пока не открыт', 503);
    const isVpnPlan = requestedPlan === VPN_PLAN.id || requestedPlan === VPN_PLUS_PLAN.id;
    const goal = isVpnPlan ? null :
      await requireActiveFundraisingGoal(b.goalSlug ?? 'player');
    const fixedPlan = requestedPlan === VPN_PLAN.id ? VPN_PLAN :
      requestedPlan === VPN_PLUS_PLAN.id ? VPN_PLUS_PLAN : subscriptionPlan(requestedPlan);
    const chosenAmount =
      requestedPlan === SUPPORT_PLAN ? supportAmount(b.amount) :
        requestedPlan === DONATION_PLAN ? donationAmount(b.amount) : null;
    if (!fixedPlan && chosenAmount === null)
      throw new ApiError(
        requestedPlan === SUPPORT_PLAN
          ? `Выберите целую сумму от ${SUPPORT_MIN_AMOUNT} до 100 000 ₽`
          : requestedPlan === DONATION_PLAN ? `Выберите целую сумму от ${DONATION_MIN_AMOUNT} до 100 000 ₽`
          : 'Неизвестный тариф',
        400,
      );
    const plan = fixedPlan || {
      id: requestedPlan === DONATION_PLAN ? DONATION_PLAN : SUPPORT_PLAN,
      label: requestedPlan === DONATION_PLAN ? 'Поддержка проекта' : '30 дней · свой тариф',
      days: requestedPlan === DONATION_PLAN ? 0 : 30,
      price: chosenAmount!.toFixed(2),
    };
    const promotion = b.promoCode ? await reservePromotion(u.id,b.promoCode,plan.id) : null;
    if (promotion && 'url' in promotion) return json({ url: promotion.url });
    const id = promotion?.id || uid();
    const price = promotion && 'quote' in promotion ? promotion.quote.amount.toFixed(2) : plan.price;
    if (!promotion)
    await db()
      .prepare(
        'INSERT INTO orders(id,user_id,created_at,provider,plan,amount,duration_days,fundraising_goal_id) VALUES (?,?,?,?,?,?,?,?)',
      )
      .bind(id, u.id, now(), 'platega', plan.id, plan.price, plan.days, goal?.id || null)
      .run();
    const p = await paymentFetch('v2/transaction/process', {
      method: 'POST',
      body: JSON.stringify({
        paymentDetails: {
          amount: Number(price),
          currency: 'RUB',
        },
        description: plan.id === VPN_PLAN.id ? `AniMonster VPN — ${VPN_PLAN.label}` :
          plan.id === VPN_PLUS_PLAN.id ? `AniMonster — ${VPN_PLUS_PLAN.label}` :
          `${goal!.title} · ${plan.id === DONATION_PLAN ? 'Поддержка AniMonster' : `AniMonster Plus — ${plan.label}`}`,
        return: `${runtime().SITE_URL || new URL(r.url).origin}/${isVpnPlan ? 'vpn' : 'pins'}?payment=return${isVpnPlan ? `&plan=${plan.id}` : ''}`,
        failedUrl: `${runtime().SITE_URL || new URL(r.url).origin}/${isVpnPlan ? 'vpn' : 'pins'}?payment=failed${isVpnPlan ? `&plan=${plan.id}` : ''}`,
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
    if (promotion) await db().prepare('UPDATE orders SET payment_url=? WHERE id=?').bind(paymentUrl,id).run();
    return json({ url: paymentUrl });
  } catch (e) {
    return fail(e);
  }
}
