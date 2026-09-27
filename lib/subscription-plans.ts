export const subscriptionPlans = {
  monthly: {
    id: 'monthly',
    label: '30 дней',
    days: 30,
    price: '109.00',
    priceLabel: '109 ₽',
    originalPriceLabel: '149 ₽',
    discount: 0,
  },
  annual: {
    id: 'annual',
    label: '365 дней',
    days: 365,
    price: '999.00',
    priceLabel: '999 ₽',
    originalPriceLabel: null,
    discount: 24,
  },
} as const;
export type SubscriptionPlan = keyof typeof subscriptionPlans;
export const ANNUAL_TAG = 'eternal-nakama';
export const SUPPORT_PLAN = 'support';
export const SUPPORT_MIN_AMOUNT = 110;
export const SUPPORT_MAX_AMOUNT = 100_000;

export function supportAmount(value: unknown) {
  const amount = Number(value);
  return Number.isInteger(amount) &&
    amount >= SUPPORT_MIN_AMOUNT &&
    amount <= SUPPORT_MAX_AMOUNT
    ? amount
    : null;
}
export function subscriptionPlan(value: unknown) {
  return value === 'monthly' || value === 'annual'
    ? subscriptionPlans[value]
    : null;
}
