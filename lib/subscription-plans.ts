export const subscriptionPlans = {
  monthly: { id: 'monthly', label: '30 дней', days: 30, price: '89.00', priceLabel: '89 ₽', discount: 0 },
  annual: { id: 'annual', label: '365 дней', days: 365, price: '961.20', priceLabel: '961,20 ₽', discount: 10 },
} as const;
export type SubscriptionPlan = keyof typeof subscriptionPlans;
export const ANNUAL_TAG = 'eternal-nakama';
export function subscriptionPlan(value: unknown) {
  return value === 'monthly' || value === 'annual' ? subscriptionPlans[value] : null;
}
