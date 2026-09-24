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
  const headers = new Headers({ Location: target.href });
  if (owner)
    headers.append(
      'Set-Cookie',
      `am_referral=${encodeURIComponent(code)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${publicUrl.protocol === 'https:' ? '; Secure' : ''}`,
    );
  return new Response(null, { status: 302, headers });
}
