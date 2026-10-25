import {
  viewer,
  body,
  ApiError,
  fail,
  json,
  sameOrigin,
} from '@/lib/server/core';
import {
  acknowledgeLegendOrigin,
  legendOriginState,
} from '@/lib/server/legend-origin';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const user = await viewer(request);
    if (!user) throw new ApiError('Войдите в аккаунт', 401);
    return json(legendOriginState(user));
  } catch (error) {
    return fail(error);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await viewer(request);
    if (!user) throw new ApiError('Войдите в аккаунт', 401);
    const input = await body(request);
    if (input.userId !== user.id)
      throw new ApiError('Аккаунт изменился. Обновите страницу.', 409);
    await acknowledgeLegendOrigin(user.id);
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
