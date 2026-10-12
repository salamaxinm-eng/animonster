import { body, fail, json, requireUser, sameOrigin, viewer } from '@/lib/server/core';
import { claimPass, passOverview, rerollPassGenre } from '@/lib/server/battlepass';
export const dynamic = 'force-dynamic';
export async function GET(r: Request) {
  try {
    const user = await viewer(r), params = new URL(r.url).searchParams;
    const result = await passOverview(user?.id, params.get('season') || undefined, user?.role === 'admin' && params.get('preview') === '1');
    return json({ ...result, canManage: user?.role === 'admin' });
  } catch (error) { return fail(error); }
}
export async function POST(r: Request) {
  try {
    sameOrigin(r); const user = await requireUser(r), input = await body(r);
    if (input.action === 'reroll') return json(await rerollPassGenre(user.id, String(input.season), Number(input.week)));
    return json(await claimPass(user.id, String(input.season)));
  } catch (error) { return fail(error); }
}
