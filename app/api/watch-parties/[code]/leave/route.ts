import { fail, json, requireUser, sameOrigin } from '@/lib/server/core';
import { endPartyByHost, leaveParty } from '@/lib/server/watch-parties';

export async function POST(
  request: Request,
  context: RouteContext<'/api/watch-parties/[code]/leave'>,
) {
  try {
    sameOrigin(request);
    const user = await requireUser(request);
    const { code } = await context.params;
    const end = new URL(request.url).searchParams.get('end') === 'true';
    return json(
      end ? await endPartyByHost(code, user) : await leaveParty(code, user),
    );
  } catch (error) {
    return fail(error);
  }
}
