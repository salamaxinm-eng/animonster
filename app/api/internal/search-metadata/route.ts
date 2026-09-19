import { ApiError, fail, json, runtime } from '@/lib/server/core';
import {
  refreshSearchMetadata,
  searchMetadataStats,
} from '@/lib/server/search-metadata';
import {
  animeRelationStats,
  refreshAnimeRelations,
} from '@/lib/server/anime-relations';

function authorize(request: Request) {
  const secret = runtime().RECOMMENDATION_CRON_SECRET || '';
  if (
    secret.length < 32 ||
    request.headers.get('authorization') !== `Bearer ${secret}`
  )
    throw new ApiError('Не найдено', 404);
}

export async function GET(request: Request) {
  try {
    authorize(request);
    const [metadata, relations] = await Promise.all([
      searchMetadataStats(),
      animeRelationStats(),
    ]);
    return json({ metadata, relations });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    authorize(request);
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
