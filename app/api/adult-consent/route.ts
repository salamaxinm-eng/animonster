import { adultConsentCookie } from '@/lib/adult-consent';
import { db, fail, json, now, sameOrigin, viewer } from '@/lib/server/core';

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await viewer(request);
    if (user)
      await db()
        .prepare('UPDATE users SET adult_confirmed_at=? WHERE id=?')
        .bind(now(), user.id)
        .run();

    const response = json({ ok: true });
    response.headers.set(
      'Set-Cookie',
      adultConsentCookie(new URL(request.url).protocol === 'https:'),
    );
    return response;
  } catch (error) {
    return fail(error);
  }
}
