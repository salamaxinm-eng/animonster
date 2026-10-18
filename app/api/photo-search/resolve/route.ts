import {
  ApiError,
  db,
  fail,
  hash,
  json,
  now,
  sameOrigin,
} from '@/lib/server/core';
import { positiveId, record } from '@/lib/photo-search';
import { resolveSceneAnime } from '@/lib/server/photo-search';

// Metadata lookup only: this route never accepts images or arbitrary URLs.
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    if (!request.headers.get('content-type')?.includes('application/json'))
      throw new ApiError('Нужен JSON', 415);
    if (Number(request.headers.get('content-length')) > 1024)
      throw new ApiError('Слишком большой запрос', 413);
    const reader = request.body?.getReader();
    if (!reader) throw new ApiError('Нужны идентификаторы аниме');
    let raw = '',
      size = 0;
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 1024) {
          await reader.cancel();
          throw new ApiError('Слишком большой запрос', 413);
        }
        raw += decoder.decode(value, { stream: true });
      }
      raw += decoder.decode();
    } finally {
      reader.releaseLock();
    }
    let input: Record<string, unknown>;
    try {
      input = record(JSON.parse(raw));
    } catch {
      throw new ApiError('Некорректный JSON');
    }
    if (
      !Array.isArray(input.ids) ||
      !input.ids.length ||
      input.ids.length > 3 ||
      input.ids.some((id) => !positiveId(id))
    )
      throw new ApiError('Нужно от 1 до 3 идентификаторов AniList');
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'local';
    const timestamp = now();
    const key = 'photo-resolve:' + (await hash(ip));
    const row = await db()
      .prepare(`INSERT INTO auth_limits(key,attempts,expires) VALUES (?,1,?)
      ON CONFLICT(key) DO UPDATE SET
      attempts=CASE WHEN auth_limits.expires<=? THEN 1 ELSE auth_limits.attempts+1 END,
      expires=CASE WHEN auth_limits.expires<=? THEN excluded.expires ELSE auth_limits.expires END RETURNING attempts,expires`)
      .bind(key, timestamp + 60000, timestamp, timestamp)
      .first<{ attempts: number; expires: number }>();
    if (Number(row?.attempts) > 30)
      return Response.json(
        { error: 'Слишком много проверок каталога. Попробуйте через минуту.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(
              Math.max(1, Math.ceil((Number(row?.expires) - timestamp) / 1000)),
            ),
            'Cache-Control': 'no-store',
          },
        },
      );
    const results = await Promise.all(
      [...new Set(input.ids as number[])].map((id) =>
        resolveSceneAnime(id, request.signal),
      ),
    );
    return json({ results });
  } catch (error) {
    return fail(error);
  }
}
