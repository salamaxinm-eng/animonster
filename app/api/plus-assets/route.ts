import {
  ApiError,
  db,
  fail,
  json,
  now,
  requireUser,
  sameOrigin,
  uid,
} from '@/lib/server/core';
import { plusEntitlements } from '@/lib/server/plus';
import { validateImage } from '@/lib/server/images';

const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await requireUser(request),
      access = await plusEntitlements(user.id);
    if (!access.active)
      throw new ApiError('Оформление доступно с AniMonster Plus', 403);
    const form = await request.formData(),
      file = form.get('image'),
      kind = String(form.get('kind') || '');
    if (
      !(file instanceof File) ||
      !['profile_background', 'list_cover'].includes(kind)
    )
      throw new ApiError('Выберите изображение');
    if (!file.size || file.size > MAX_BYTES)
      throw new ApiError('Изображение должно быть не больше 5 МБ', 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { mime: type } = validateImage(bytes, {
      minWidth: 300,
      minHeight: 180,
    });
    const listId = String(form.get('list_id') || '');
    if (
      kind === 'list_cover' &&
      !(await db()
        .prepare('SELECT 1 FROM collection_lists WHERE id=? AND user_id=?')
        .bind(listId, user.id)
        .first())
    )
      throw new ApiError('Список не найден', 404);
    const id = uid(),
      value = `asset:${id}:${now()}`;
    await db()
      .prepare(
        'INSERT INTO plus_assets(id,user_id,kind,mime_type,data,updated_at) VALUES (?,?,?,?,?,?)',
      )
      .bind(id, user.id, kind, type, Buffer.from(bytes), now())
      .run();
    if (kind === 'profile_background')
      await db()
        .prepare('UPDATE users SET profile_background=? WHERE id=?')
        .bind(value, user.id)
        .run();
    else {
      const result = await db()
        .prepare(
          'UPDATE collection_lists SET cover=? WHERE id=? AND user_id=? RETURNING id',
        )
        .bind(value, listId, user.id)
        .first();
      if (!result) throw new ApiError('Список не найден', 404);
    }
    return json({ value });
  } catch (error) {
    return fail(error);
  }
}
