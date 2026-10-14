import { ApiError, fail, requireUser, sameOrigin } from '@/lib/server/core';

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await requireUser(request);
    throw new ApiError('Загрузка своих аватарок отключена. Выберите аватар из каталога.', 403, 'custom_avatar_disabled');
  } catch (error) {
    return fail(error);
  }
}
