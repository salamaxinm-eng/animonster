import { avatars, themes } from '../community';
import { ApiError, db, now, uid, type User } from './core';
import { cosmeticEquipValue, validateEquippedCosmetic } from './cosmetics';
import { plusEntitlements } from './plus';
import { validateImage } from './images';

async function uploadedImage(
  form: FormData,
  key: string,
  max: number,
  minWidth: number,
  minHeight: number,
) {
  const file = form.get(key);
  if (!(file instanceof File) || !file.size) return null;
  if (file.size > max)
    throw new ApiError(
      `Изображение слишком большое: не более ${max / 1024 / 1024} МБ`,
      413,
    );
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { mime } = validateImage(bytes, { minWidth, minHeight });
  return { mime, bytes: Buffer.from(bytes) };
}

// Reuses the existing image, level, subscription and ownership rules. Validation
// finishes before any writes; files and equipped items commit together.
export async function saveProfileAppearance(user: User, form: FormData) {
  let input: Record<string, unknown>;
  try {
    input = JSON.parse(String(form.get('appearance') || ''));
  } catch {
    throw new ApiError('Некорректное оформление');
  }
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new ApiError('Некорректное оформление');
  const access = await plusEntitlements(user.id);
  const avatarFile = await uploadedImage(
    form,
    'avatar',
    2 * 1024 * 1024,
    128,
    128,
  );
  const backgroundFile = await uploadedImage(
    form,
    'background',
    5 * 1024 * 1024,
    300,
    180,
  );
  const avatar = String(input.avatar || user.avatar);
  if ((avatarFile || avatar !== user.avatar) && !access.canChangeAvatar)
    throw new ApiError(
      'Смена аватара откроется на 5 уровне или с AniMonster Plus.',
      403,
      'avatar_locked',
    );
  if (
    !avatarFile &&
    !avatars.some((item) => item.id === avatar) &&
    avatar !== user.avatar
  )
    throw new ApiError('Неизвестный аватар');
  const theme = themes.find((item) => item.id === input.theme);
  if (!theme) throw new ApiError('Неизвестная тема');
  if (theme.cosmetic)
    await validateEquippedCosmetic(
      user.id,
      'theme',
      theme.cosmetic,
      access.premiumUntil,
    );
  const [frame, pin, tag] = await Promise.all([
    validateEquippedCosmetic(
      user.id,
      'frame',
      input.frame,
      access.premiumUntil,
    ),
    validateEquippedCosmetic(user.id, 'pin', input.pin, access.premiumUntil),
    validateEquippedCosmetic(user.id, 'tag', input.tag, access.premiumUntil),
  ]);
  let background: string | null = null;
  const chosen = String(input.background || '');
  if (backgroundFile) {
    if (!access.active)
      throw new ApiError('Загрузка фона доступна с AniMonster Plus', 403);
  } else if (chosen.startsWith('asset:')) {
    if (!access.active)
      throw new ApiError('Свой фон доступен с AniMonster Plus', 403);
    const owned = await db()
      .prepare(
        "SELECT 1 FROM plus_assets WHERE id=? AND user_id=? AND kind='profile_background'",
      )
      .bind(chosen.split(':')[1], user.id)
      .first();
    if (!owned)
      throw new ApiError('Фон не принадлежит вам', 403, 'cosmetic_locked');
    background = chosen;
  } else {
    const slug = await validateEquippedCosmetic(
      user.id,
      'background',
      chosen,
      access.premiumUntil,
    );
    background = await cosmeticEquipValue('background', slug);
  }
  await db().transaction(async (tx) => {
    const time = now();
    let savedAvatar = avatar;
    let savedBackground = background;
    if (avatarFile) {
      await tx
        .prepare(
          'INSERT INTO user_avatars(user_id,mime_type,data,updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET mime_type=excluded.mime_type,data=excluded.data,updated_at=excluded.updated_at',
        )
        .bind(user.id, avatarFile.mime, avatarFile.bytes, time)
        .run();
      savedAvatar = `custom:${user.id}:${time}`;
    } else if (avatars.some((item) => item.id === avatar)) {
      await tx
        .prepare('DELETE FROM user_avatars WHERE user_id=?')
        .bind(user.id)
        .run();
    }
    if (backgroundFile) {
      const id = uid();
      await tx
        .prepare(
          'INSERT INTO plus_assets(id,user_id,kind,mime_type,data,updated_at) VALUES (?,?,?,?,?,?)',
        )
        .bind(
          id,
          user.id,
          'profile_background',
          backgroundFile.mime,
          backgroundFile.bytes,
          time,
        )
        .run();
      savedBackground = `asset:${id}:${time}`;
    }
    await tx
      .prepare(
        'UPDATE users SET avatar=?,theme=?,profile_frame=?,pin=?,tag=?,profile_background=? WHERE id=?',
      )
      .bind(savedAvatar, theme.id, frame, pin, tag, savedBackground, user.id)
      .run();
  });
}
