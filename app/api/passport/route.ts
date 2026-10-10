import { ApiError, body, db, fail, json, now, requireUser, sameOrigin, viewer } from '@/lib/server/core';
import { clearPassport, getPassport, getSettings, passportAccess, passportAwardOptions } from '@/lib/server/passport';

export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('id') || (await viewer(request))?.id;
    if (!id) throw new ApiError('Войдите в аккаунт', 401);
    const access = await passportAccess(request, id);
    if (!access) throw new ApiError('Паспорт не найден', 404);
    if (new URL(request.url).searchParams.get('mode') === 'access')
      return json({ own: access.own, public: !!access.settings.is_public, nick: access.user.nick });
    return json(await getPassport(access.user, access.settings, access.own));
  } catch (error) { return fail(error); }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await requireUser(request);
    const input = await body(request);
    const current = await getSettings(user.id);
    const isPublic = typeof input.is_public === 'boolean' ? Number(input.is_public) : current.is_public;
    const favorites = input.favorite_ids === undefined ? current.favorite_ids : input.favorite_ids;
    const awards = input.award_ids === undefined ? current.award_ids : input.award_ids;
    if (!Array.isArray(favorites) || favorites.length > 3 ||
      favorites.some((value) => !Number.isInteger(value) || value < 1 || value > 999999999) ||
      new Set(favorites).size !== favorites.length)
      throw new ApiError('Выберите не более трёх разных тайтлов');
    if (!Array.isArray(awards) || awards.length > 3 ||
      awards.some((value) => typeof value !== 'string' || value.length > 100) ||
      new Set(awards).size !== awards.length)
      throw new ApiError('Выберите не более трёх разных наград');
    for (const id of favorites) {
      if (!(await db().prepare('SELECT 1 AS found FROM anime_cache WHERE id=?').bind(id).first()))
        throw new ApiError('Тайтл не найден в каталоге');
    }
    const owned = new Set((await passportAwardOptions(user.id)).map((row) => row.id));
    if (awards.some((id) => !owned.has(id))) throw new ApiError('Можно выбрать только полученные награды', 403);
    await db().prepare(`INSERT INTO passport_settings(user_id,is_public,favorite_ids,award_ids,updated_at)
      VALUES (?,?,?::jsonb,?::jsonb,?)
      ON CONFLICT(user_id) DO UPDATE SET is_public=excluded.is_public,
      favorite_ids=excluded.favorite_ids,award_ids=excluded.award_ids,updated_at=excluded.updated_at`)
      .bind(user.id, isPublic, JSON.stringify(favorites), JSON.stringify(awards), now()).run();
    clearPassport(user.id);
    return json({ ok: true });
  } catch (error) { return fail(error); }
}
