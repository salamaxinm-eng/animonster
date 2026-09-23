import { referralCodeOwner } from '@/lib/server/referrals';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const code = (await params).code.trim().toUpperCase();
  const owner = await referralCodeOwner(code);
  const target = new URL(owner ? '/profile' : '/', request.url);
  if (!owner) target.searchParams.set('referral', 'invalid');
  const response = Response.redirect(target, 302);
  if (owner)
    response.headers.append(
      'Set-Cookie',
      `am_referral=${encodeURIComponent(code)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`,
    );
  return response;
}
