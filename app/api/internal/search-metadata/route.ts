import { ApiError, fail, json, runtime } from '@/lib/server/core';
import { refreshSearchMetadata } from '@/lib/server/search-metadata';

export async function POST(request: Request) {
  try {
    const secret = runtime().RECOMMENDATION_CRON_SECRET || '';
    if (
      secret.length < 32 ||
      request.headers.get('authorization') !== `Bearer ${secret}`
    )
      throw new ApiError('Не найдено', 404);
    const input = await request.json().catch(() => ({}));
    return json(await refreshSearchMetadata(Number(input.limit) || 40));
  } catch (error) {
    return fail(error);
  }
}
