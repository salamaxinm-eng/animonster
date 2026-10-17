import { body, fail, json, requireUser, sameOrigin } from '@/lib/server/core';
import { titleRestrictionResponse } from '@/lib/server/title-restrictions';
import {
  prepareOfflineDownload,
  prepareOfflineDownloads,
} from '@/lib/server/offline';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await requireUser(request);
    const input = await body(request);
    const denied = await titleRestrictionResponse(request.headers, Number(input.animeId));
    if (denied) return denied;
    return json(
      Array.isArray((input as Record<string, unknown>)?.episodes)
        ? await prepareOfflineDownloads(user, input)
        : await prepareOfflineDownload(user, input),
    );
  } catch (error) {
    return fail(error);
  }
}
