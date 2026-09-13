import { db } from '@/lib/server/core';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const row = await db()
    .prepare('SELECT mime_type,data,updated_at FROM plus_assets WHERE id=?')
    .bind(id)
    .first<{ mime_type: string; data: Uint8Array; updated_at: number }>();
  if (!row) return new Response('Not found', { status: 404 });
  return new Response(Buffer.from(row.data), {
    headers: {
      'Content-Type': row.mime_type,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
