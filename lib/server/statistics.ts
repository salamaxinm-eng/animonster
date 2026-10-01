import { db, now } from './core';
import { supporterLeaderboard } from './supporters';

export const PLAYER_FUND_GOAL = 60_000;

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
  const [supporters, allTimeViews, monthlyViews, funding] = await Promise.all([
    supporterLeaderboard(10),
    viewLeaderboard(),
    viewLeaderboard(last30Days),
    db()
      .prepare(
        "SELECT COALESCE(SUM(amount),0) AS amount FROM orders WHERE status='succeeded' AND NOT is_test",
      )
      .first<{ amount: string | number }>(),
  ]);

  return {
    goal: PLAYER_FUND_GOAL,
    raised: Number(funding?.amount || 0),
    supporters,
    allTimeViews,
    monthlyViews,
  };
}
