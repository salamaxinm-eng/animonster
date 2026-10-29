import {
  ApiError,
  body,
  db,
  fail,
  json,
  now,
  requireUser,
  sameOrigin,
} from '@/lib/server/core';
import { loadPieceCatalog } from '@/lib/server/one-piece';
import type { PieceCondition } from '@/lib/one-piece';

async function admin(request: Request) {
  const user = await requireUser(request);
  if (user.role !== 'admin')
    throw new ApiError('Только для администратора', 403);
  return user;
}
export async function GET(request: Request) {
  try {
    await admin(request);
    return json(
      (
        await db()
          .prepare(
            `SELECT code,name,description,rarity,xp_reward,condition_config,active FROM achievements WHERE anime_id=21 AND metric='verified_condition' ORDER BY sort_order`,
          )
          .all()
      ).results,
    );
  } catch (e) {
    return fail(e);
  }
}
export async function PATCH(request: Request) {
  try {
    sameOrigin(request);
    await admin(request);
    const input = await body(request),
      catalog = await loadPieceCatalog();
    if (
      !/^ACH_ONE_PIECE_\d{3}$/.test(input.code) ||
      typeof input.name !== 'string' ||
      !input.name.trim() ||
      input.name.length > 100 ||
      typeof input.description !== 'string' ||
      input.description.length > 1000 ||
      !['common', 'rare', 'epic', 'legendary', 'mythic'].includes(
        input.rarity,
      ) ||
      !Number.isSafeInteger(input.xp_reward) ||
      input.xp_reward < 0 ||
      input.xp_reward > 10000 ||
      typeof input.active !== 'boolean'
    )
      throw new ApiError('Проверьте поля достижения');
    const c = input.condition_config as PieceCondition;
    const integer = (v: unknown, min = 1, max = 10000) =>
      typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
    const episodes = (v: unknown) =>
      Array.isArray(v) &&
      v.length > 0 &&
      v.length <= 5000 &&
      v.every((e) => integer(e)) &&
      new Set(v).size === v.length;
    const valid =
      c &&
      ((c.type === 'count' && integer(c.target)) ||
        (c.type === 'episodes' && episodes(c.episodes)) ||
        (c.type === 'session' && integer(c.target)) ||
        (c.type === 'rolling' &&
          integer(c.target) &&
          integer(c.days, 1, 365)) ||
        (c.type === 'return' && integer(c.days, 1, 3650)) ||
        (c.type === 'backtrack' && integer(c.distance, 2)) ||
        (c.type === 'night' &&
          integer(c.from, 0, 23) &&
          integer(c.to, 1, 24) &&
          c.to! > c.from!) ||
        (c.type === 'rewatch' && c.episode === 1 && integer(c.after)) ||
        c.type === 'saga_achievements' ||
        (c.type === 'arc' && catalog.arcs.some((a) => a.id === c.key)) ||
        (c.type === 'saga' && catalog.sagas.some((s) => s.id === c.key)) ||
        (c.type === 'snapshot' && episodes(c.episodes)));
    if (!valid) throw new ApiError('Некорректная конфигурация условия');
    const current = await db()
      .prepare(
        "SELECT condition_config FROM achievements WHERE code=? AND metric='verified_condition' AND anime_id=21",
      )
      .bind(input.code)
      .first<{ condition_config: PieceCondition }>();
    if (!current) throw new ApiError('Достижение не найдено', 404);
    const previous =
      typeof current.condition_config === 'string'
        ? JSON.parse(current.condition_config)
        : current.condition_config;
    if (
      input.code === 'ACH_ONE_PIECE_030' &&
      JSON.stringify(previous) !== JSON.stringify(c)
    )
      throw new ApiError(
        'Набор «Короля пиратов» зафиксирован при выпуске и не изменяется',
      );
    await db()
      .prepare(
        'UPDATE achievements SET name=?,description=?,rarity=?,xp_reward=?,condition_config=?::text::jsonb,condition_type=?,active=?,updated_at=? WHERE code=?',
      )
      .bind(
        input.name.trim(),
        input.description.trim(),
        input.rarity,
        input.xp_reward,
        JSON.stringify(c),
        c.type,
        input.active ? 1 : 0,
        now(),
        input.code,
      )
      .run();
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
