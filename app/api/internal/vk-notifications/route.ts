import { ApiError, fail, json, runtime } from '@/lib/server/core';
import { runVkNotifications } from '@/lib/server/vk-notifications';
export async function POST(request: Request) {
  try {
    const secret = runtime().RECOMMENDATION_CRON_SECRET || '';
    if (
      secret.length < 32 ||
      request.headers.get('authorization') !== `Bearer ${secret}`
    )
      throw new ApiError('Не найдено', 404);
    return json(await runVkNotifications());
  } catch (error) {
    return fail(error);
  }
}
