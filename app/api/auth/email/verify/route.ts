import { db, hash, now, base } from '@/lib/server/core';

export async function GET(r: Request) {
  const token = new URL(r.url).searchParams.get('token') || '';
  if (token.length < 40) return Response.redirect(`${base()}/profile?verification=invalid`);
  const row = await db().prepare(
    `WITH consumed AS (
      UPDATE email_tokens SET used_at=? WHERE hash=? AND purpose='verify' AND used_at IS NULL AND expires_at>? RETURNING user_id
    ) UPDATE users SET email_verified=1 WHERE id=(SELECT user_id FROM consumed) RETURNING id`,
  ).bind(now(), await hash(token), now()).first();
  return Response.redirect(`${base()}/profile?verification=${row ? 'success' : 'invalid'}`);
}
