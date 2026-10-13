import { db, runtime, viewer } from '@/lib/server/core';
import { canViewBattlepass } from '@/lib/server/battlepass-access';
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!canViewBattlepass(await viewer(request))) return new Response(null, { status: 404 });
  const { id } = await ctx.params;
  if (!/^[a-f0-9-]{36}$/.test(id)) return new Response(null, { status: 404 });
  const asset = await db().prepare('SELECT mime,data,sha256 FROM pass_assets WHERE id=?').bind(id).first<{ mime: string; data: Uint8Array; sha256: string }>();
  if (!asset) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(asset.data), { headers: { 'Content-Type': asset.mime, 'Cache-Control': runtime().BATTLEPASS_PREVIEW_USER_ID ? 'private,no-store' : 'public,max-age=31536000,immutable', ETag: `"${asset.sha256}"`, 'X-Content-Type-Options': 'nosniff' } });
}
