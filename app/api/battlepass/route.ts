import { body, fail, json, requireUser, runtime, sameOrigin, viewer } from '@/lib/server/core';
import { claimPass, passOverview, rerollPassGenre } from '@/lib/server/battlepass';
import { requireBattlepassAccess } from '@/lib/server/battlepass-access';
export const dynamic = 'force-dynamic';
export async function GET(r: Request) {
  try {
    const user = await viewer(r), params = new URL(r.url).searchParams;
    requireBattlepassAccess(user);
    const ownerPreview = !!runtime().BATTLEPASS_PREVIEW_USER_ID && user?.id === runtime().BATTLEPASS_PREVIEW_USER_ID;
    const preview = user?.role === 'admin' && (params.get('preview') === '1' || ownerPreview);
    const season = params.get('season') || (ownerPreview ? 'oni-awakening' : undefined);
    const result = await passOverview(user?.id, season, preview);
    return json({ ...result, canManage: user?.role === 'admin' });
  } catch (error) { return fail(error); }
}
export async function POST(r: Request) {
  try {
    sameOrigin(r); const user = await requireUser(r), input = await body(r);
    requireBattlepassAccess(user);
    if (input.action === 'reroll') return json(await rerollPassGenre(user.id, String(input.season), Number(input.week)));
    return json(await claimPass(user.id, String(input.season)));
  } catch (error) { return fail(error); }
}
