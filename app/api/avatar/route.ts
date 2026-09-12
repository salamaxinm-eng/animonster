import {
  ApiError,
  db,
  fail,
  json,
  now,
  requireUser,
  sameOrigin,
} from '@/lib/server/core';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

function detectImageType(bytes: Uint8Array) {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    return 'image/jpeg';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return 'image/png';
  if (
    bytes.length >= 12 &&
    new TextDecoder('ascii').decode(bytes.slice(0, 4)) === 'RIFF' &&
    new TextDecoder('ascii').decode(bytes.slice(8, 12)) === 'WEBP'
  )
    return 'image/webp';
  return null;
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await requireUser(request);
    if (!request.headers.get('content-type')?.includes('multipart/form-data'))
      throw new ApiError('Выберите файл изображения.', 415, 'image_required');
    const form = await request.formData();
    const file = form.get('avatar');
    if (!(file instanceof File))
      throw new ApiError('Выберите файл изображения.', 400, 'image_required');
    if (!file.size || file.size > MAX_AVATAR_BYTES)
      throw new ApiError('Аватар должен быть не больше 2 МБ.', 413, 'avatar_too_large');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = detectImageType(bytes);
    if (!mime)
      throw new ApiError(
        'Поддерживаются только PNG, JPEG и WebP.',
        415,
        'avatar_type_not_supported',
      );
    const updatedAt = now();
    await db().batch([
      db()
        .prepare(
          'INSERT INTO user_avatars(user_id,mime_type,data,updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET mime_type=excluded.mime_type,data=excluded.data,updated_at=excluded.updated_at',
        )
        .bind(user.id, mime, Buffer.from(bytes), updatedAt),
      db()
        .prepare('UPDATE users SET avatar=? WHERE id=?')
        .bind(`custom:${user.id}:${updatedAt}`, user.id),
    ]);
    return json({ avatar: `custom:${user.id}:${updatedAt}` });
  } catch (error) {
    return fail(error);
  }
}
