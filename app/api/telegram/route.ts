import {
  ApiError,
  body,
  db,
  fail,
  hash,
  json,
  now,
  requireUser,
  runtime,
  sameOrigin,
} from '@/lib/server/core';
import { plusEntitlements } from '@/lib/server/plus';

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const [account, subscriptions] = await Promise.all([
      db()
        .prepare(
          'SELECT telegram_id,username,linked_at,disabled_at FROM telegram_accounts WHERE user_id=?',
        )
        .bind(user.id)
        .first(),
      db()
        .prepare(
          'SELECT anime_id,title,created_at FROM telegram_subscriptions WHERE user_id=? ORDER BY created_at',
        )
        .bind(user.id)
        .all(),
    ]);
    const access = await plusEntitlements(user.id);
    return json({
      account,
      subscriptions: subscriptions.results,
      limit: access.telegramTitleLimit,
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await requireUser(request),
      data = await body(request),
      action = String(data.action || '');
    if (action === 'link') {
      const username = runtime().TELEGRAM_BOT_USERNAME?.replace(/^@/, '');
      if (!username || !runtime().TELEGRAM_BOT_TOKEN)
        throw new ApiError('Telegram-бот ещё не настроен', 503);
      const token = Buffer.from(
        crypto.getRandomValues(new Uint8Array(24)),
      ).toString('base64url');
      await db()
        .prepare(`INSERT INTO telegram_accounts(user_id,link_token_hash,link_expires_at)
        VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET link_token_hash=excluded.link_token_hash,link_expires_at=excluded.link_expires_at`)
        .bind(user.id, await hash(token), now() + 15 * 60000)
        .run();
      return json({ url: `https://t.me/${username}?start=${token}` });
    }
    if (action === 'disconnect') {
      await db()
        .prepare(
          'UPDATE telegram_accounts SET telegram_id=NULL,username=NULL,linked_at=NULL,disabled_at=NULL WHERE user_id=?',
        )
        .bind(user.id)
        .run();
      return json({ ok: true });
    }
    const animeId = Number(data.anime_id),
      title = String(data.title || '')
        .trim()
        .slice(0, 200);
    if (!Number.isInteger(animeId) || animeId < 1 || !title)
      throw new ApiError('Некорректный тайтл');
    if (action === 'unsubscribe') {
      await db()
        .prepare(
          'DELETE FROM telegram_subscriptions WHERE user_id=? AND anime_id=?',
        )
        .bind(user.id, animeId)
        .run();
      return json({ ok: true });
    }
    if (action !== 'subscribe') throw new ApiError('Неизвестное действие');
    const existingSubscription = await db()
      .prepare(
        'SELECT 1 FROM telegram_subscriptions WHERE user_id=? AND anime_id=?',
      )
      .bind(user.id, animeId)
      .first();
    if (existingSubscription) return json({ ok: true });
    const access = await plusEntitlements(user.id);
    if (access.telegramTitleLimit != null) {
      const count = await db()
        .prepare(
          'SELECT count(*) AS n FROM telegram_subscriptions WHERE user_id=?',
        )
        .bind(user.id)
        .first<{ n: number }>();
      if (Number(count?.n || 0) >= access.telegramTitleLimit)
        throw new ApiError(
          `Без Plus можно выбрать до ${access.telegramTitleLimit} тайтлов`,
          403,
        );
    }
    await db()
      .prepare(
        'INSERT INTO telegram_subscriptions(user_id,anime_id,title,created_at) VALUES (?,?,?,?) ON CONFLICT(user_id,anime_id) DO NOTHING',
      )
      .bind(user.id, animeId, title, now())
      .run();
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
