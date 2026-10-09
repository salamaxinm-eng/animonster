import { ApiError, db } from './core';
import type { FundraisingGoal, FundraisingReward } from '../fundraising';

type GoalRow = {
  id: string;
  slug: string;
  title: string;
  short_title: string;
  description: string;
  target_amount: string | number;
  raised: string | number;
  is_active: boolean;
  sort_order: number;
  reward_bundle_id: string | null;
  bundle_owned: boolean;
};

export async function fundraisingGoals(
  userId?: string,
): Promise<FundraisingGoal[]> {
  const [goals, items] = await Promise.all([
    db()
      .prepare(`SELECT g.*,
      COALESCE((SELECT SUM(o.amount) FROM orders o WHERE o.fundraising_goal_id=g.id
        AND o.status='succeeded' AND NOT o.is_test),0) AS raised,
      (EXISTS(SELECT 1 FROM fundraising_reward_grants rg WHERE rg.user_id=? AND rg.bundle_id=g.reward_bundle_id)
       OR (EXISTS(SELECT 1 FROM fundraising_reward_items i WHERE i.bundle_id=g.reward_bundle_id)
         AND NOT EXISTS(SELECT 1 FROM fundraising_reward_items i WHERE i.bundle_id=g.reward_bundle_id
           AND NOT EXISTS(SELECT 1 FROM user_cosmetics uc WHERE uc.user_id=? AND uc.cosmetic_id=i.cosmetic_id)))) AS bundle_owned
      FROM fundraising_goals g ORDER BY g.sort_order,g.slug`)
      .bind(userId || null, userId || null)
      .all<GoalRow>(),
    db()
      .prepare(`SELECT i.bundle_id,c.id,c.kind,c.slug,c.name,c.image
      FROM fundraising_reward_items i JOIN cosmetics c ON c.id=i.cosmetic_id
      ORDER BY i.sort_order,c.id`)
      .all<FundraisingReward & { bundle_id: string }>(),
  ]);
  return goals.results.map((goal) => {
    const raised = Number(goal.raised);
    const targetAmount = Number(goal.target_amount);
    return {
      id: goal.id,
      slug: goal.slug,
      title: goal.title,
      shortTitle: goal.short_title,
      description: goal.description,
      targetAmount,
      raised,
      percent: Math.min(100, Math.max(0, (raised / targetAmount) * 100)),
      remaining: Math.max(0, targetAmount - raised),
      isActive: goal.is_active,
      sortOrder: goal.sort_order,
      bundleId: goal.reward_bundle_id,
      bundleOwned: goal.bundle_owned,
      rewards: items.results
        .filter((item) => item.bundle_id === goal.reward_bundle_id)
        .map(({ bundle_id: _bundle, ...item }) => item),
    };
  });
}

export async function requireActiveFundraisingGoal(rawSlug: unknown) {
  if (typeof rawSlug !== 'string')
    throw new ApiError('Выберите цель поддержки', 400, 'goal_required');
  const goal = await db()
    .prepare(
      'SELECT id,slug,title FROM fundraising_goals WHERE slug=? AND is_active=true',
    )
    .bind(rawSlug)
    .first<{ id: string; slug: string; title: string }>();
  if (!goal)
    throw new ApiError(
      'Этот сбор недоступен. Выберите активную цель.',
      400,
      'goal_inactive',
    );
  return goal;
}
