import {
  ApiError,
  db,
  fail,
  json,
  now,
  requireUser,
  sameOrigin,
} from '@/lib/server/core';
import { plusEntitlements } from '@/lib/server/plus';
import { validateImage } from '@/lib/server/images';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await requireUser(request);
    const access = await plusEntitlements(user.id);
    if (!access.canChangeAvatar)
      throw new ApiError(
        'Смена аватара откроется на 5 уровне или с AniMonster Plus.',
        403,
        'avatar_locked',
      );
    if (!request.headers.get('content-type')?.includes('multipart/form-data'))
      throw new ApiError('Выберите файл изображения.', 415, 'image_required');
    const form = await request.formData();
    const file = form.get('avatar');
    if (!(file instanceof File))
      throw new ApiError('Выберите файл изображения.', 400, 'image_required');
    if (!file.size || file.size > MAX_AVATAR_BYTES)
      throw new ApiError(
        'Аватар должен быть не больше 2 МБ.',
        413,
        'avatar_too_large',
      );
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { mime } = validateImage(bytes, {
      minWidth: 128,
      minHeight: 128,
    });
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
