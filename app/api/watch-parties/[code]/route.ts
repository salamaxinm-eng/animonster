import { fail, json, requireUser } from '@/lib/server/core';
import { partySnapshot } from '@/lib/server/watch-parties';

export async function GET(
  request: Request,
  context: RouteContext<'/api/watch-parties/[code]'>,
) {
  try {
    const user = await requireUser(request);
    const { code } = await context.params;
    return json(await partySnapshot(code, user));
  } catch (error) {
    return fail(error);
  }
}
