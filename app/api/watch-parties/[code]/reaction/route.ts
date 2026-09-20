import { body, fail, json, requireUser, sameOrigin } from '@/lib/server/core';
import { sendPartyReaction } from '@/lib/server/watch-parties';

export async function POST(
  request: Request,
  context: RouteContext<'/api/watch-parties/[code]/reaction'>,
) {
  try {
    sameOrigin(request);
    const user = await requireUser(request);
    const { code } = await context.params;
    const input = await body(request);
    return json(await sendPartyReaction(code, user, input.reaction));
  } catch (error) {
    return fail(error);
  }
}
