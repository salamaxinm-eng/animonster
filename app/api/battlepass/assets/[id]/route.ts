import { db, runtime, viewer } from '@/lib/server/core';
import { canViewBattlepass } from '@/lib/server/battlepass-access';
import { PASS_IMAGE_WIDTHS, type PassImageWidth } from '@/lib/pass-images';
import { createPassAssetCache, type PassAssetSource } from '@/lib/server/pass-asset-image';
const globalCache = globalThis as typeof globalThis & { __passAssetCache?: ReturnType<typeof createPassAssetCache> };
const cache = globalCache.__passAssetCache ??= createPassAssetCache(id => db().prepare('SELECT mime,data,sha256 FROM pass_assets WHERE id=?').bind(id).first<PassAssetSource>());
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const privatePreview = !!runtime().BATTLEPASS_PREVIEW_USER_ID?.trim();
  if (privatePreview && !canViewBattlepass(await viewer(request))) return new Response(null, { status: 404 });
  const { id } = await ctx.params;
  if (!/^[a-f0-9-]{36}$/.test(id)) return new Response(null, { status: 404 });
  const widthParam = new URL(request.url).searchParams.get('w');
  if (widthParam !== null) {
    const width = Number(widthParam) as PassImageWidth;
    if (!PASS_IMAGE_WIDTHS.includes(width)) return new Response(null, { status: 400 });
    try {
      const { image, cache: status } = await cache.get(id, width);
      if (!image) return new Response(null, { status: 404 });
      const headers = { 'Content-Type': image.mime, 'Cache-Control': privatePreview ? 'private,no-store' : 'public,max-age=31536000,immutable', ETag: image.etag, 'X-Content-Type-Options': 'nosniff', 'X-AniMonster-Image-Cache': status };
      if (request.headers.get('if-none-match')?.split(',').some(value => value.trim().replace(/^W\//, '') === image.etag || value.trim() === '*')) return new Response(null, { status: 304, headers });
      return new Response(image.bytes.slice(), { headers: { ...headers, 'Content-Length': String(image.bytes.byteLength) } });
    } catch { return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '1' } }); }
  }
  const asset = await db().prepare('SELECT mime,data,sha256 FROM pass_assets WHERE id=?').bind(id).first<{ mime: string; data: Uint8Array; sha256: string }>();
  if (!asset) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(asset.data), { headers: { 'Content-Type': asset.mime, 'Cache-Control': runtime().BATTLEPASS_PREVIEW_USER_ID ? 'private,no-store' : 'public,max-age=31536000,immutable', ETag: `"${asset.sha256}"`, 'X-Content-Type-Options': 'nosniff' } });
}
