import { ApiError, fail, json, runtime } from '@/lib/server/core';
import { runPlusWorker } from '@/lib/server/plus-worker';
export async function POST(request: Request) {
  try {
    const secret = runtime().RECOMMENDATION_CRON_SECRET || '';
    if (
      secret.length < 32 ||
      request.headers.get('authorization') !== `Bearer ${secret}`
    )
      throw new ApiError('Не найдено', 404);
    const data = await request.json().catch(() => ({}));
    return json(
      await runPlusWorker(Math.min(100, Math.max(1, Number(data.limit) || 20))),
    );
  } catch (error) {
    return fail(error);
  }
}
