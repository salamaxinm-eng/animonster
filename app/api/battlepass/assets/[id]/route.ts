import { db } from '@/lib/server/core';
export async function GET(_r: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[a-f0-9-]{36}$/.test(id)) return new Response(null, { status: 404 });
  const asset = await db().prepare('SELECT mime,data,sha256 FROM pass_assets WHERE id=?').bind(id).first<{ mime: string; data: Uint8Array; sha256: string }>();
  if (!asset) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(asset.data), { headers: { 'Content-Type': asset.mime, 'Cache-Control': 'public,max-age=31536000,immutable', ETag: `"${asset.sha256}"`, 'X-Content-Type-Options': 'nosniff' } });
}
