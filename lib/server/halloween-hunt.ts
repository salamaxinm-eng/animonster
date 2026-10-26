import { ApiError, db, now } from './core';
import {
  halloweenActive,
  halloweenLocalDay,
  HALLOWEEN_SPIRITS,
  HALLOWEEN_BADGE,
} from '../halloween';
export async function halloweenHuntState(
  userId: string | null,
  actor: string,
  deviceActor = actor,
) {
  const day = halloweenLocalDay(now());
  const found = userId
    ? (
        await db()
          .prepare(
            'SELECT spirit_id FROM halloween_spirit_finds WHERE user_id=? ORDER BY spirit_id',
          )
          .bind(userId)
          .all<{ spirit_id: string }>()
      ).results.map((row) => row.spirit_id)
    : [];
  const awarded = !!(
    userId &&
    (await db()
      .prepare('SELECT 1 FROM user_cosmetics WHERE user_id=? AND cosmetic_id=?')
      .bind(userId, HALLOWEEN_BADGE)
      .first())
  );
  const candleUsed = !!(await db()
    .prepare(
      'SELECT 1 FROM halloween_candle_uses WHERE actor IN (?,?) AND day=?::text::date',
    )
    .bind(actor, deviceActor, day)
    .first());
  return {
    userId,
    found,
    awarded,
    day,
    candleUsed,
    active: halloweenActive(now()),
  };
}
export async function findHalloweenSpirit(userId: string, spirit: unknown) {
  if (!halloweenActive(now()))
    throw new ApiError('Хэллоуинская охота завершилась', 410);
  if (
    typeof spirit !== 'string' ||
    !(HALLOWEEN_SPIRITS as readonly string[]).includes(spirit)
  )
    throw new ApiError('Неизвестный дух');
  return db().transaction(async (tx) => {
    const user = await tx
      .prepare('SELECT id FROM users WHERE id=? FOR UPDATE')
      .bind(userId)
      .first();
    if (!user) throw new ApiError('Аккаунт не найден', 404);
    await tx
      .prepare(
        'INSERT INTO halloween_spirit_finds(user_id,spirit_id,found_at) VALUES (?,?,?) ON CONFLICT DO NOTHING',
      )
      .bind(userId, spirit, now())
      .run();
    const count = await tx
      .prepare(
        'SELECT count(*)::integer AS total FROM halloween_spirit_finds WHERE user_id=?',
      )
      .bind(userId)
      .first<{ total: number }>();
    if (count?.total === HALLOWEEN_SPIRITS.length) {
      await tx
        .prepare(`INSERT INTO user_cosmetics(user_id,cosmetic_id,unlocked_at,source,source_key,metadata)
    VALUES (?,?,?,'achievement','halloween-2026-spirits',jsonb_build_object('spirits',5,'event','halloween-2026'))
    ON CONFLICT(user_id,cosmetic_id) DO NOTHING`)
        .bind(userId, HALLOWEEN_BADGE, now())
        .run();
    }
  });
}
export async function activateHalloweenCandle(
  actor: string,
  deviceActor = actor,
) {
  if (!halloweenActive(now())) throw new ApiError('Хэллоуин завершился', 410);
  const day = halloweenLocalDay(now());
  return db().transaction(async (tx) => {
    for (const key of [...new Set([actor, deviceActor])].sort()) {
      const row = await tx
        .prepare(
          'INSERT INTO halloween_candle_uses(actor,day,used_at) VALUES (?,?::text::date,?) ON CONFLICT DO NOTHING RETURNING actor',
        )
        .bind(key, day, now())
        .first();
      if (!row)
        throw new ApiError(
          'Свеча уже гасила свет сегодня. Возвращайтесь завтра.',
          409,
          'candle_used',
        );
    }
    return { day, candleUsed: true };
  });
}
