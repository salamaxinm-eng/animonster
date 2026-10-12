import { ApiError, runtime, type User } from './core';

export function canViewBattlepass(user: User | null) {
  const ownerId = runtime().BATTLEPASS_PREVIEW_USER_ID?.trim();
  return !ownerId || user?.id === ownerId;
}

export function requireBattlepassAccess(user: User | null) {
  if (!canViewBattlepass(user)) throw new ApiError('Не найдено', 404);
}
