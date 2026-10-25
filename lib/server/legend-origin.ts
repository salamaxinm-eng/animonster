import { db, now, type User } from './core';
export function legendOriginState(
  user: Pick<User, 'legend_origin_at' | 'legend_origin_seen_at'>,
) {
  return {
    awardedAt: Number(user.legend_origin_at) || null,
    pending: !!user.legend_origin_at && !user.legend_origin_seen_at,
  };
}
export async function acknowledgeLegendOrigin(userId: string) {
  await db()
    .prepare(
      'UPDATE users SET legend_origin_seen_at=? WHERE id=? AND legend_origin_at IS NOT NULL AND legend_origin_seen_at IS NULL',
    )
    .bind(now(), userId)
    .run();
}
