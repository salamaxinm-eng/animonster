import { body, fail, json, requireUser, sameOrigin } from '@/lib/server/core';
import { offlineDownloadOptions } from '@/lib/server/offline';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await requireUser(request);
    return json(await offlineDownloadOptions(user, await body(request)));
  } catch (error) {
    return fail(error);
  }
}
