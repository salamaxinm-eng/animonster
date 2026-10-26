import {
  ApiError,
  body,
  cookie,
  fail,
  hash,
  json,
  requireUser,
  sameOrigin,
  uid,
  viewer,
} from '@/lib/server/core';
import {
  halloweenHuntState,
  findHalloweenSpirit,
  activateHalloweenCandle,
} from '@/lib/server/halloween-hunt';
export const dynamic = 'force-dynamic';
async function identity(request: Request) {
  const user = await viewer(request);
  let token = cookie(request, 'am_hw_guest');
  const fresh = !/^[a-f0-9]{32}$/.test(token);
  if (fresh) token = uid().replaceAll('-', '');
  const deviceActor = 'guest:' + (await hash(token));
  return {
    user,
    deviceActor,
    actor: user ? 'user:' + user.id : deviceActor,
    token,
    fresh,
  };
}
function response(value: unknown, who: { fresh: boolean; token: string }) {
  const r = json(value);
  if (who.fresh)
    r.headers.append(
      'Set-Cookie',
      `am_hw_guest=${who.token}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=1209600`,
    );
  return r;
}
export async function GET(request: Request) {
  try {
    const who = await identity(request);
    return response(
      await halloweenHuntState(
        who.user?.id || null,
        who.actor,
        who.deviceActor,
      ),
      who,
    );
  } catch (error) {
    return fail(error);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const who = await identity(request),
      input = await body(request);
    if (input.userId !== (who.user?.id || null))
      throw new ApiError('Аккаунт изменился. Обновите страницу.', 409);
    if (input.action === 'find') {
      const user = await requireUser(request);
      await findHalloweenSpirit(user.id, input.spirit);
      return response(
        await halloweenHuntState(user.id, who.actor, who.deviceActor),
        who,
      );
    }
    if (input.action === 'candle')
      return response(
        await activateHalloweenCandle(who.actor, who.deviceActor),
        who,
      );
    throw new ApiError('Неизвестное действие');
  } catch (error) {
    return fail(error);
  }
}
