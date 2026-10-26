import { avatars, themes } from '../community';
import { ApiError, db, type User } from './core';
import { cosmeticEquipValue, validateEquippedCosmetic } from './cosmetics';
import { validateNicknameChoice } from './nickname';
import { plusEntitlements } from './plus';

// Existing custom images may stay equipped; new uploads and custom backgrounds are blocked.
export async function saveProfileAppearance(user: User, form: FormData) {
  if (form.has('avatar') || form.has('background'))
    throw new ApiError('Загрузка своих аватарок и фонов отключена.', 403, 'custom_images_disabled');
  let input: Record<string, unknown>;
  try { input = JSON.parse(String(form.get('appearance') || '')); }
  catch { throw new ApiError('Некорректное оформление'); }
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new ApiError('Некорректное оформление');
  const access = await plusEntitlements(user.id);
  const avatar = String(input.avatar || user.avatar);
  if (avatar !== user.avatar && !access.canChangeAvatar)
    throw new ApiError('Смена аватара откроется на 5 уровне или с AniMonster Plus.', 403, 'avatar_locked');
  if (!avatars.some(item => item.id === avatar) && avatar !== user.avatar)
    throw new ApiError('Неизвестный аватар');
  const theme = themes.find(item => item.id === input.theme);
  if (!theme) throw new ApiError('Неизвестная тема');
  if (theme.cosmetic) await validateEquippedCosmetic(user.id, 'theme', theme.cosmetic, access.premiumUntil);
  const [frame, pin, tag] = await Promise.all([
    validateEquippedCosmetic(user.id, 'frame', input.frame, access.premiumUntil),
    validateEquippedCosmetic(user.id, 'pin', input.pin, access.premiumUntil),
    validateEquippedCosmetic(user.id, 'tag', input.tag, access.premiumUntil),
  ]);
  let background: string | null = null;
  const chosen = String(input.background || '');
  if (chosen.startsWith('asset:')) {
    if (chosen !== user.profile_background)
      throw new ApiError('Установка своих фонов отключена. Выберите фон из коллекции.', 403, 'custom_background_disabled');
    background = chosen;
  } else {
    const slug = await validateEquippedCosmetic(user.id, 'background', chosen, access.premiumUntil);
    background = await cosmeticEquipValue('background', slug);
  }
  await db().transaction(async tx => {
    const locked = await tx.prepare('SELECT * FROM users WHERE id=? FOR UPDATE').bind(user.id).first<User>();
    if (!locked) throw new ApiError('Аккаунт не найден', 404);
    const style = 'nickname_style' in input ? validateNicknameChoice(locked, input.nickname_style) : locked.nickname_style || null;
    await tx.prepare('UPDATE users SET avatar=?,theme=?,profile_frame=?,pin=?,tag=?,profile_background=?,nickname_style=?::text::jsonb WHERE id=?')
      .bind(avatar, theme.id, frame, pin, tag, background, style ? JSON.stringify(style) : null, user.id).run();
  });
}
