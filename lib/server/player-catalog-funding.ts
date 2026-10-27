import { ApiError, db } from './core';
import { playerCatalogProgress } from '../player-catalog-funding';
export async function playerCatalogFunding() {
  const row = await db()
    .prepare(`SELECT c.starts_at,
    COALESCE((SELECT ROUND(SUM(o.amount)*100)::bigint FROM orders o
      WHERE o.fundraising_goal_id='player' AND o.plan='donation' AND o.status='succeeded'
      AND NOT o.is_test AND o.confirmed_at>=c.starts_at
      AND EXISTS(SELECT 1 FROM users u WHERE u.id=o.user_id AND u.identity NOT LIKE 'preview:%')),0) AS total_cents,
    EXISTS(SELECT 1 FROM fundraising_goals WHERE slug='player' AND is_active=true) AS active
    FROM player_catalog_campaign c WHERE c.id=1`)
    .first<{
      starts_at: string | number;
      total_cents: string | number;
      active: boolean;
    }>();
  if (!row) throw new ApiError('Сбор пока готовится', 503);
  return {
    ...playerCatalogProgress(Number(row.total_cents)),
    startsAt: Number(row.starts_at),
    active: row.active,
  };
}
