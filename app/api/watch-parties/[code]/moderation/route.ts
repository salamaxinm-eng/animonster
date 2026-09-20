import { body, fail, json, requireUser, sameOrigin } from '@/lib/server/core';
import { moderateParty } from '@/lib/server/watch-parties';

export async function POST(
  request: Request,
  context: RouteContext<'/api/watch-parties/[code]/moderation'>,
) {
  try {
    sameOrigin(request);
    const user = await requireUser(request);
    const { code } = await context.params;
    return json(await moderateParty(code, user, await body(request)));
  } catch (error) {
    return fail(error);
  }
}
