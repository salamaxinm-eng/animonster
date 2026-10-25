import { randomBytes } from 'node:crypto';
import {
  ApiError,
  body,
  cookie,
  fail,
  hash,
  json,
  sameOrigin,
  viewer,
} from '@/lib/server/core';
import { changeFeedback, feedbackStatus } from '@/lib/server/demo-feedback';
export const dynamic = 'force-dynamic';
async function identity(request: Request) {
  const user = await viewer(request);
  const saved = cookie(request, 'am_demo_feedback');
  const token = /^[a-f0-9]{48}$/.test(saved)
    ? saved
    : randomBytes(24).toString('hex');
  const subject = user ? 'user:' + user.id : 'guest:' + (await hash(token));
  return {
    subject,
    userId: user?.id || null,
    scope: await hash(subject),
    token: !user && token !== saved ? token : null,
  };
}
function response(data: unknown, person: Awaited<ReturnType<typeof identity>>) {
  const result = json({ ...(data as object), scope: person.scope });
  if (person.token)
    result.headers.append(
      'Set-Cookie',
      `am_demo_feedback=${person.token}; Path=/api/player-demo/feedback; Max-Age=31536000; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
    );
  return result;
}
export async function GET(request: Request) {
  try {
    const person = await identity(request);
    return response(await feedbackStatus(person.subject), person);
  } catch (error) {
    return fail(error);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const person = await identity(request),
      input = await body(request);
    if (input.scope !== person.scope)
      throw new ApiError('Аккаунт изменился. Обновите страницу.', 409);
    return response(
      await changeFeedback(person.subject, person.userId, input),
      person,
    );
  } catch (error) {
    return fail(error);
  }
}
