import { referralCodeOwner } from '@/lib/server/referrals';
import { base } from '@/lib/server/core';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const code = (await params).code.trim().toUpperCase();
  const owner = await referralCodeOwner(code);
  const publicUrl = new URL(base());
  const target = new URL(owner ? '/profile' : '/', publicUrl);
  if (!owner) target.searchParams.set('referral', 'invalid');
  const response = Response.redirect(target, 302);
  if (owner)
    response.headers.append(
      'Set-Cookie',
      `am_referral=${encodeURIComponent(code)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${publicUrl.protocol === 'https:' ? '; Secure' : ''}`,
    );
  return response;
}
