import { fail, json, requireUser, sameOrigin } from '@/lib/server/core';
import { joinParty } from '@/lib/server/watch-parties';

export async function POST(
  request: Request,
  context: RouteContext<'/api/watch-parties/[code]/join'>,
) {
  try {
    sameOrigin(request);
    const user = await requireUser(request);
    const { code } = await context.params;
    return json(await joinParty(code, user));
  } catch (error) {
    return fail(error);
  }
}
