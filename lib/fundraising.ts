export type FundraisingReward = {
  id: string;
  kind: 'pin' | 'tag' | 'frame' | 'background';
  slug: string;
  name: string;
  image: string;
};

export type FundraisingGoal = {
  id: string;
  slug: string;
  title: string;
  shortTitle: string;
  description: string;
  targetAmount: number;
  raised: number;
  percent: number;
  remaining: number;
  isActive: boolean;
  sortOrder: number;
  bundleId: string | null;
  bundleOwned: boolean;
  rewards: FundraisingReward[];
};

export const DONATION_PLAN = 'donation';
export const DONATION_MIN_AMOUNT = 150;
export const DONATION_MAX_AMOUNT = 100_000;
export function donationAmount(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const amount = Number(value);
  return Number.isInteger(amount) &&
    amount >= DONATION_MIN_AMOUNT &&
    amount <= DONATION_MAX_AMOUNT
    ? amount
    : null;
}
