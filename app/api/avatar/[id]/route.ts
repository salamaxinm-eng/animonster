import { ApiError, db, fail } from '@/lib/server/core';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!/^[a-f0-9-]{36}$/i.test(id))
      throw new ApiError('Аватар не найден.', 404, 'avatar_not_found');
    const avatar = await db()
      .prepare(
        'SELECT mime_type,data,updated_at FROM user_avatars WHERE user_id=?',
      )
      .bind(id)
      .first<{ mime_type: string; data: Uint8Array; updated_at: number }>();
    if (!avatar)
      throw new ApiError('Аватар не найден.', 404, 'avatar_not_found');
    const bytes = Uint8Array.from(avatar.data);
    return new Response(bytes.buffer, {
      headers: {
        'Content-Type': avatar.mime_type,
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return fail(error);
  }
}
