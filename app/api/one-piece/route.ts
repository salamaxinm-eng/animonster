import {
  ApiError,
  body,
  db,
  fail,
  json,
  now,
  requireUser,
  sameOrigin,
  viewer,
} from '@/lib/server/core';
import {
  onePieceOverview,
  synchronizePiece,
  claimPieceNotices,
} from '@/lib/server/one-piece';

export async function GET(request: Request) {
  try {
    return json(await onePieceOverview((await viewer(request))?.id));
  } catch (error) {
    return fail(error);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await requireUser(request),
      input = await body(request);
    const stamp = now(),
      row = await db()
        .prepare(`INSERT INTO auth_limits(key,attempts,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET
      attempts=CASE WHEN auth_limits.expires<=? THEN 1 ELSE auth_limits.attempts+1 END,
      expires=CASE WHEN auth_limits.expires<=? THEN excluded.expires ELSE auth_limits.expires END RETURNING attempts`)
        .bind('piece-actions:' + user.id, stamp + 60000, stamp, stamp)
        .first<{ attempts: number }>();
    if (Number(row?.attempts) > 30)
      throw new ApiError('Попробуйте через минуту', 429);
    if (input.action === 'sync') return json(await synchronizePiece(user.id));
    if (input.action === 'notices')
      return json(await claimPieceNotices(user.id));
    throw new ApiError('Неизвестное действие');
  } catch (error) {
    return fail(error);
  }
}
