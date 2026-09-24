import {
  ApiError,
  body,
  fail,
  json,
  now,
  requireUser,
  sameOrigin,
} from '@/lib/server/core';
import { OFFLINE_LICENSE_MS } from '@/lib/server/offline';
import { plusEntitlements } from '@/lib/server/plus';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await requireUser(request);
    const input = (await body(request)) as Record<string, unknown>;
    const animeId = Number(input.animeId);
    const episode = Number(input.episode);
    if (!Number.isInteger(animeId) || !Number.isInteger(episode))
      throw new ApiError('Некорректная серия.');
    const access = await plusEntitlements(user.id);
    if (!access.canDownload)
      throw new ApiError('Доступно с AniMonster Plus', 403, 'PLUS_REQUIRED');
    return json({
      ok: true,
      offlineAccessUntil: Math.min(
        access.premiumUntil,
        now() + OFFLINE_LICENSE_MS,
      ),
    });
  } catch (error) {
    return fail(error);
  }
}
