import { body, fail, json, requireUser, sameOrigin } from '@/lib/server/core';
import { offlineDownloadOptions } from '@/lib/server/offline';
import { titleRestrictionResponse } from '@/lib/server/title-restrictions';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await requireUser(request);
    const input = await body(request);
    const denied = await titleRestrictionResponse(request.headers, Number(input.animeId));
    if (denied) return denied;
    return json(await offlineDownloadOptions(user, input));
  } catch (error) {
    return fail(error);
  }
}
