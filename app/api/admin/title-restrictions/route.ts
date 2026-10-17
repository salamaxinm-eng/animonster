import {
  ApiError,
  body,
  fail,
  json,
  sameOrigin,
  viewer,
} from '@/lib/server/core';
import {
  listTitleRestrictions,
  removeTitleRestriction,
  saveTitleRestrictions,
} from '@/lib/server/title-restriction-admin';

export const dynamic = 'force-dynamic';

async function administrator(request: Request) {
  const user = await viewer(request);
  if (!user || user.role !== 'admin')
    throw new ApiError('Не найдено', 404, 'not_found');
  return user;
}

export async function GET(request: Request) {
  try {
    await administrator(request);
    return json({ items: await listTitleRestrictions() });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await administrator(request);
    const input = await body(request);
    if (input.action === 'add')
      return json(
        await saveTitleRestrictions(user.id, input.links, input.reason),
      );
    if (input.action === 'remove')
      return json(await removeTitleRestriction(user.id, input.animeId));
    throw new ApiError('Неизвестное действие.');
  } catch (error) {
    return fail(error);
  }
}
