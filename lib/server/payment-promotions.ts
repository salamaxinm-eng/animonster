import { ApiError, db, now, uid } from './core';
import { VPN_PLAN } from '@/lib/vpn-plan';

export function promoCode(value: unknown) {
  if (typeof value !== 'string' || value.trim().length > 64)
    throw new ApiError('Некорректный промокод');
  return value.trim().toLowerCase();
}
type Promotion = { code: string; percent: number; starts_at: number; expires_at: number };
export async function quotePromotion(userId: string, value: unknown, plan: string, connection = db()) {
  if (plan !== VPN_PLAN.id) throw new ApiError('Промокод действует только на VPN на 30 дней');
  const code = promoCode(value);
  const promotion = await connection.prepare(`SELECT code,percent,starts_at,expires_at FROM payment_promotions
    WHERE code=? AND enabled=true AND starts_at<=? AND expires_at>?`).bind(code, now(), now()).first<Promotion>();
  if (!promotion) throw new ApiError('Промокод не найден или срок его действия закончился');
  const claim = await connection.prepare('SELECT used_at FROM payment_promo_claims WHERE code=? AND user_id=?')
    .bind(code,userId).first<{ used_at: number | null }>();
  if (claim?.used_at != null) throw new ApiError('Вы уже использовали этот промокод');
  const originalCents = Math.round(Number(VPN_PLAN.price)*100);
  const discountCents = Math.round(originalCents*Number(promotion.percent)/100);
  return { code, percent: Number(promotion.percent), originalAmount: originalCents/100,
    discountAmount: discountCents/100, amount: (originalCents-discountCents)/100,
    expiresAt: Number(promotion.expires_at) };
}
export async function reservePromotion(userId: string, value: unknown, plan: string) {
  if (plan !== VPN_PLAN.id) throw new ApiError('Промокод действует только на VPN на 30 дней');
  return db().transaction(async (tx) => {
    await tx.prepare('SELECT id FROM users WHERE id=? FOR UPDATE').bind(userId).first();
    const code=promoCode(value);
    const existing=await tx.prepare(`SELECT o.id,o.payment_url,c.used_at FROM payment_promo_claims c
      JOIN orders o ON o.id=c.order_id WHERE c.code=? AND c.user_id=?`).bind(code,userId)
      .first<{ id: string; payment_url: string | null; used_at: number | null }>();
    if (existing) {
      if (existing.used_at != null) throw new ApiError('Вы уже использовали этот промокод');
      if (existing.payment_url) return { id: existing.id, url: existing.payment_url };
      throw new ApiError('Платёж уже создаётся или ожидает проверки. Повторите проверку оплаты позже.',409);
    }
    const quote=await quotePromotion(userId,code,plan,tx);
    const id=uid();
    await tx.prepare(`INSERT INTO orders(id,user_id,created_at,provider,plan,amount,duration_days,
      promo_code,original_amount,discount_amount) VALUES (?,?,?,'platega','vpn',?,30,?,?,?)`)
      .bind(id,userId,now(),quote.amount.toFixed(2),code,quote.originalAmount,quote.discountAmount).run();
    await tx.prepare('INSERT INTO payment_promo_claims(code,user_id,order_id) VALUES (?,?,?)')
      .bind(code,userId,id).run();
    return { id, quote };
  });
}
