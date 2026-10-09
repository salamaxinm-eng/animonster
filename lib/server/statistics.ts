import { db, now } from './core';
import { supporterLeaderboard } from './supporters';
import { fundraisingGoals } from './fundraising';

export type ViewLeader = {
  id: string;
  nick: string;
  views: number;
};

async function viewLeaderboard(since?: number): Promise<ViewLeader[]> {
  const rows = await db()
    .prepare(
      `SELECT u.id,u.nick,COUNT(*)::integer AS views
       FROM qualified_episode_views v
       JOIN users u ON u.id=v.user_id
       WHERE u.deleted_at IS NULL ${since === undefined ? '' : 'AND v.qualified_at>=?'}
       GROUP BY u.id,u.nick
       ORDER BY views DESC,u.id
       LIMIT 10`,
    )
    .bind(...(since === undefined ? [] : [since]))
    .all<ViewLeader>();
  return rows.results.map((row) => ({ ...row, views: Number(row.views) }));
}

export async function publicStatistics() {
  const last30Days = now() - 30 * 24 * 60 * 60 * 1000;
  const [supporters, allTimeViews, monthlyViews, goals] = await Promise.all([
    supporterLeaderboard(10),
    viewLeaderboard(),
    viewLeaderboard(last30Days),
    fundraisingGoals(),
  ]);

  return {
    // Preserve the original API fields for clients deployed before goals.
    goal: goals.find((goal) => goal.slug === 'player')?.targetAmount ?? 0,
    raised: goals.find((goal) => goal.slug === 'player')?.raised ?? 0,
    goals,
    supporters,
    allTimeViews,
    monthlyViews,
  };
}
