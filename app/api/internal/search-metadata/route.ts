import { ApiError, fail, json, runtime } from '@/lib/server/core';
import { refreshSearchMetadata } from '@/lib/server/search-metadata';
import { refreshAnimeRelations } from '@/lib/server/anime-relations';

export async function POST(request: Request) {
  try {
    const secret = runtime().RECOMMENDATION_CRON_SECRET || '';
    if (
      secret.length < 32 ||
      request.headers.get('authorization') !== `Bearer ${secret}`
    )
      throw new ApiError('Не найдено', 404);
    const input = await request.json().catch(() => ({}));
    const [metadata, relations] = await Promise.all([
      refreshSearchMetadata(Number(input.limit) || 40),
      refreshAnimeRelations(Number(input.relation_limit) || 12),
    ]);
    return json({ metadata, relations });
  } catch (error) {
    return fail(error);
  }
}
