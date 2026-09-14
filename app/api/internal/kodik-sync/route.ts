import { ApiError, fail, json, runtime } from '@/lib/server/core';
import { runKodikSync } from '@/lib/server/kodik-sync';

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
      await runKodikSync(Math.max(1, Math.min(5, Number(data.pages) || 5))),
    );
  } catch (error) {
    return fail(error);
  }
}
