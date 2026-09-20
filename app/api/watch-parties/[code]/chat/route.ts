import { body, fail, json, requireUser, sameOrigin } from '@/lib/server/core';
import { reportPartyMessage, sendPartyChat } from '@/lib/server/watch-parties';

export async function POST(
  request: Request,
  context: RouteContext<'/api/watch-parties/[code]/chat'>,
) {
  try {
    sameOrigin(request);
    const user = await requireUser(request);
    const { code } = await context.params;
    const input = await body(request);
    return json(
      input.action === 'report'
        ? await reportPartyMessage(code, user, input.message_id, input.reason)
        : await sendPartyChat(code, user, input.body),
      201,
    );
  } catch (error) {
    return fail(error);
  }
}
