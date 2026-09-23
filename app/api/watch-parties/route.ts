import { body, fail, json, requireUser, sameOrigin } from '@/lib/server/core';
import { hasAdultConsent } from '@/lib/adult-consent';
import {
  activeParty,
  createParty,
  requireWatchParties,
} from '@/lib/server/watch-parties';

export async function GET(request: Request) {
  try {
    requireWatchParties();
    const user = await requireUser(request);
    return json({ active: await activeParty(user.id) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    requireWatchParties();
    sameOrigin(request);
    const user = await requireUser(request);
    if (
      !user.adult_confirmed_at &&
      hasAdultConsent(request.headers.get('cookie'))
    )
      user.adult_confirmed_at = Date.now();
    return json(await createParty(user, await body(request)), 201);
  } catch (error) {
    return fail(error);
  }
}
