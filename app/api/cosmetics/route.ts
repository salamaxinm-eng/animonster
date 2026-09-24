import {
  ApiError,
  body,
  fail,
  json,
  requireUser,
  sameOrigin,
} from '@/lib/server/core';
import {
  cosmeticsCatalog,
  type CosmeticKind,
  validateEquippedCosmetic,
} from '@/lib/server/cosmetics';

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return json({ cosmetics: await cosmeticsCatalog(user.id) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await requireUser(request);
    const input = await body(request);
    const kind = String(input.kind || '') as CosmeticKind;
    if (!['tag', 'pin', 'frame', 'theme'].includes(kind))
      throw new ApiError('Неизвестный тип косметики');
    const slug = await validateEquippedCosmetic(user.id, kind, input.slug);
    const column = kind === 'frame' ? 'profile_frame' : kind;
    const value = kind === 'theme' && slug === 'bleach-theme' ? 'bleach' : slug;
    await dbUpdate(column, value, user.id);
    return json({ ok: true, kind, slug });
  } catch (error) {
    return fail(error);
  }
}

async function dbUpdate(column: string, value: string | null, userId: string) {
  const { db } = await import('@/lib/server/core');
  if (!['tag', 'pin', 'profile_frame', 'theme'].includes(column))
    throw new ApiError('Некорректное поле');
  await db()
    .prepare(`UPDATE users SET ${column}=? WHERE id=?`)
    .bind(value, userId)
    .run();
}
