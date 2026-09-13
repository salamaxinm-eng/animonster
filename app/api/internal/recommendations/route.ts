import { timingSafeEqual } from 'node:crypto';
import {
  ApiError,
  body,
  fail,
  isModerator,
  json,
  runtime,
  sameOrigin,
  viewer,
} from '@/lib/server/core';
import {
  forceRecomputeUser,
  recomputeRecommendationBatch,
} from '@/lib/server/recommendations/service';

function matchesSecret(value: string, expected: string) {
  const left = Buffer.from(value);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function authorize(request: Request) {
  const configured = runtime().RECOMMENDATION_CRON_SECRET?.trim() || '';
  const supplied =
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (configured.length >= 32 && matchesSecret(supplied, configured)) return;
  const user = await viewer(request);
  if (!isModerator(user)) throw new ApiError('Доступ запрещён', 403);
  sameOrigin(request);
}

export async function POST(request: Request) {
  try {
    await authorize(request);
    const input = await body(request);
    const userId = String(input.user_id || '').trim();
    if (userId) {
      const result = await forceRecomputeUser(userId);
      if (!result) throw new ApiError('Пользователь не найден', 404);
      return json({ ok: true, user_id: userId, ...result });
    }
    const results = await recomputeRecommendationBatch(
      Number(input.limit) || 10,
    );
    return json({
      ok: true,
      processed: results.length,
      completed: results.filter((result) => result.ok).length,
      failed: results.filter((result) => !result.ok).length,
    });
  } catch (error) {
    return fail(error);
  }
}
