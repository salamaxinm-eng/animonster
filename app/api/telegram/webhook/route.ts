import {
  ApiError,
  db,
  fail,
  hash,
  json,
  now,
  runtime,
} from '@/lib/server/core';

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
    if (!token || !message?.chat?.id) return json({ ok: true });
    const account = await db()
      .prepare(
        'SELECT user_id FROM telegram_accounts WHERE link_token_hash=? AND link_expires_at>?',
      )
      .bind(await hash(token), now())
      .first<{ user_id: string }>();
    if (!account) {
      await send(
        message.chat.id,
        'Ссылка устарела. Создайте новую в профиле AniMonster.',
      );
      return json({ ok: true });
    }
    await db()
      .prepare(
        `UPDATE telegram_accounts SET telegram_id=?,username=?,linked_at=?,disabled_at=NULL,link_token_hash=NULL,link_expires_at=NULL WHERE user_id=?`,
      )
      .bind(
        message.chat.id,
        message.from?.username || null,
        now(),
        account.user_id,
      )
      .run();
    await send(
      message.chat.id,
      'Telegram подключён к AniMonster. Теперь сюда будут приходить уведомления о выбранных тайтлах.',
    );
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
