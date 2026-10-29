import {
  ApiError,
  body,
  db,
  fail,
  json,
  now,
  premium,
  requireUser,
  sameOrigin,
} from '@/lib/server/core';
import { createVkConnection, vkBotReady } from '@/lib/server/vk-notifications';
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    if (!vkBotReady())
      return json({ ready: false, account: null, subscriptions: [], limit: 3 });
    const [account, subscriptions, plus] = await Promise.all([
      db()
        .prepare(
          'SELECT vk_user_id,linked_at,disabled_at FROM vk_bot_accounts WHERE user_id=?',
        )
        .bind(user.id)
        .first(),
      db()
        .prepare(
          'SELECT anime_id,title,created_at FROM vk_bot_subscriptions WHERE user_id=? ORDER BY created_at,anime_id',
        )
        .bind(user.id)
        .all(),
      premium(user.id),
    ]);
    return json({
      ready: true,
      account,
      subscriptions: subscriptions.results,
      limit: plus > now() ? null : 3,
    });
  } catch (error) {
    return fail(error);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await requireUser(request),
      data = await body(request);
    if (!vkBotReady()) throw new ApiError('Бот ВК пока недоступен', 503);
    if (data.action === 'link') {
      return json(await createVkConnection(user.id));
    }
    if (data.action === 'disconnect') {
      await db().transaction(async (tx) => {
        await tx
          .prepare(
            'UPDATE vk_bot_accounts SET vk_user_id=NULL,linked_at=NULL,disabled_at=NULL,link_token_hash=NULL,link_expires_at=NULL WHERE user_id=?',
          )
          .bind(user.id)
          .run();
        await tx
          .prepare(
            "UPDATE vk_bot_outbox SET status='disabled',lease_token=NULL WHERE user_id=? AND status IN ('pending','retry','sending')",
          )
          .bind(user.id)
          .run();
      });
      return json({ ok: true });
    }
    const anime = Number(data.anime_id);
    if (!Number.isSafeInteger(anime) || anime < 1 || anime > 999999999)
      throw new ApiError('Некорректный тайтл');
    if (data.action === 'unsubscribe') {
      await db().transaction(async (tx) => {
        await tx
          .prepare(
            'DELETE FROM vk_bot_subscriptions WHERE user_id=? AND anime_id=?',
          )
          .bind(user.id, anime)
          .run();
        await tx
          .prepare(
            "UPDATE vk_bot_outbox SET status='disabled',lease_token=NULL WHERE user_id=? AND anime_id=? AND status IN ('pending','retry','sending')",
          )
          .bind(user.id, anime)
          .run();
      });
      return json({ ok: true });
    }
    if (data.action !== 'subscribe') throw new ApiError('Неизвестное действие');
    await db().transaction(async (tx) => {
      await tx
        .prepare('SELECT id FROM users WHERE id=? FOR UPDATE')
        .bind(user.id)
        .first();
      const account = await tx
        .prepare(
          'SELECT vk_user_id,disabled_at FROM vk_bot_accounts WHERE user_id=?',
        )
        .bind(user.id)
        .first<{ vk_user_id: string; disabled_at: number | null }>();
      if (!account?.vk_user_id || account.disabled_at)
        throw new ApiError(
          'Подключите ВК и разрешите сообщения сообщества',
          409,
        );
      const existing = await tx
        .prepare(
          'SELECT 1 FROM vk_bot_subscriptions WHERE user_id=? AND anime_id=?',
        )
        .bind(user.id, anime)
        .first();
      if (existing) return;
      const count = await tx
        .prepare(
          'SELECT count(*) AS n FROM vk_bot_subscriptions WHERE user_id=?',
        )
        .bind(user.id)
        .first<{ n: number }>();
      const plus = await tx
        .prepare(
          'SELECT 1 FROM grants WHERE user_id=? AND revoked_at IS NULL AND (expires>? OR lifetime) LIMIT 1',
        )
        .bind(user.id, now())
        .first();
      if (!plus && Number(count?.n || 0) >= 3)
        throw new ApiError('Без Plus можно выбрать до 3 тайтлов для ВК', 403);
      const row = await tx
        .prepare('SELECT data FROM anime_cache WHERE id=?')
        .bind(anime)
        .first<{ data: string }>();
      if (!row) throw new ApiError('Аниме не найдено', 404);
      const item = JSON.parse(row.data),
        title = String(item.russian || item.name || '')
          .trim()
          .slice(0, 200);
      if (!title) throw new ApiError('Аниме не найдено', 404);
      await tx
        .prepare(
          'INSERT INTO vk_bot_subscriptions(user_id,anime_id,title,created_at) VALUES(?,?,?,?) ON CONFLICT DO NOTHING',
        )
        .bind(user.id, anime, title, now())
        .run();
    });
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
