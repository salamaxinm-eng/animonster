import {
  ApiError,
  db,
  fail,
  hash,
  json,
  now,
  runtime,
} from '@/lib/server/core';
import { lockTelegramAccount } from '@/lib/server/social-accounts';

async function send(chatId: number, text: string) {
  await fetch(
    `https://api.telegram.org/bot${runtime().TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(10000),
    },
  );
}
export async function POST(request: Request) {
  try {
    const secret = runtime().TELEGRAM_WEBHOOK_SECRET || '';
    if (
      secret.length < 24 ||
      request.headers.get('x-telegram-bot-api-secret-token') !== secret
    )
      throw new ApiError('Не найдено', 404);
    const update = await request.json(),
      message = update.message;
    const token = /^\/start\s+([A-Za-z0-9_-]{20,80})$/.exec(
      String(message?.text || ''),
    )?.[1];
    if (
      !token ||
      message?.chat?.type !== 'private' ||
      !Number.isSafeInteger(message.chat.id) ||
      message.chat.id <= 0 ||
      message.from?.id !== message.chat.id
    )
      return json({ ok: true });
    const tokenHash = await hash(token);
    const linked = await db().transaction(async (connection) => {
      await lockTelegramAccount(connection, String(message.chat.id));
      const account = await connection
        .prepare(
          'SELECT user_id FROM telegram_accounts WHERE link_token_hash=? AND link_expires_at>? FOR UPDATE',
        )
        .bind(tokenHash, now())
        .first<{ user_id: string }>();
      if (!account) return false;
      const owners = await connection
        .prepare(`SELECT user_id FROM telegram_accounts WHERE telegram_id=?
        UNION SELECT user_id FROM auth_identities WHERE provider='telegram' AND provider_account_id=?`)
        .bind(message.chat.id, String(message.chat.id))
        .all<{ user_id: string }>();
      if (owners.results.some((owner) => owner.user_id !== account.user_id))
        throw new ApiError('Telegram уже подключён к другому профилю', 409);
      await connection
        .prepare(`UPDATE telegram_accounts SET telegram_id=?,username=?,linked_at=?,disabled_at=NULL,
        link_token_hash=NULL,link_expires_at=NULL WHERE user_id=? AND link_token_hash=? AND link_expires_at>?`)
        .bind(
          message.chat.id,
          message.from?.username || null,
          now(),
          account.user_id,
          tokenHash,
          now(),
        )
        .run();
      return true;
    });
    if (!linked) {
      await send(
        message.chat.id,
        'Ссылка устарела. Создайте новую в профиле AniMonster.',
      );
      return json({ ok: true });
    }
    await send(
      message.chat.id,
      'Telegram подключён к AniMonster. Теперь сюда будут приходить уведомления о выбранных тайтлах.',
    );
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
