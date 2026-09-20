import { body, fail, json, requireUser, sameOrigin } from '@/lib/server/core';
import { recordPartyProgress } from '@/lib/server/watch-parties';

export async function POST(
  request: Request,
  context: RouteContext<'/api/watch-parties/[code]/progress'>,
) {
  try {
    sameOrigin(request);
    const user = await requireUser(request);
    const { code } = await context.params;
    const input = await body(request);
    return json(await recordPartyProgress(code, user, input.seconds));
  } catch (error) {
    return fail(error);
  }
}
