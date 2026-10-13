import { ApiError, db, fail, requireUser } from '@/lib/server/core';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!/^[a-f0-9-]{36}$/.test(id)) return new Response(null, { status: 404 });
    const thumb = new URL(request.url).searchParams.get('size') === 'thumb';
    const item = await db().prepare(`SELECT status,${thumb ? 'thumb_png' : 'full_png'} AS data FROM cosmetic_generations WHERE id=?`)
      .bind(id).first<{ status: string; data: Uint8Array }>();
    if (!item) return new Response(null, { status: 404 });
    if (item.status !== 'published') {
      const user = await requireUser(request);
      if (user.role !== 'admin') throw new ApiError('Недоступно', 404);
    }
    return new Response(new Uint8Array(item.data), { headers: {
      'Content-Type': 'image/png', 'X-Content-Type-Options': 'nosniff',
      'Cache-Control': item.status === 'published' ? 'public,max-age=31536000,immutable' : 'private,no-store',
    } });
  } catch (error) { return fail(error); }
}
