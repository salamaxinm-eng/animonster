import { ApiError, db, hash, now, runtime } from './core';

export function vkBotReady() {
  const env = runtime();
  return (
    env.VK_BOT_ENABLED === 'true' &&
    /^[1-9]\d*$/.test(env.VK_BOT_GROUP_ID || '') &&
    !!env.VK_BOT_TOKEN &&
    (env.VK_BOT_SECRET?.length || 0) >= 24 &&
    !!env.VK_BOT_CONFIRMATION
  );
}
export class VkBotError extends Error {
  constructor(public code: number) {
    super(`VK API error ${code}`);
  }
}
export async function vkBotApi(
  method: string,
  values: Record<string, string | number>,
) {
  const token = runtime().VK_BOT_TOKEN;
  if (!token) throw new ApiError('Бот ВК пока недоступен', 503);
  const form = new URLSearchParams({ access_token: token, v: '5.199' });
  for (const [key, value] of Object.entries(values))
    form.set(key, String(value));
  const response = await fetch(`https://api.vk.com/method/${method}`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(10000),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`VK HTTP ${response.status}`);
  const data = await response.json();
  if (data.error) throw new VkBotError(Number(data.error.error_code) || -1);
  if (!Object.hasOwn(data, 'response')) throw new Error('Invalid VK response');
  return data.response;
}
export async function vkBotCallback(update: Record<string, any>) {
  if (
    !vkBotReady() ||
    String(update.group_id) !== runtime().VK_BOT_GROUP_ID ||
    typeof update.secret !== 'string' ||
    (await hash(update.secret)) !== (await hash(runtime().VK_BOT_SECRET!))
  )
    throw new ApiError('Не найдено', 404);
  if (update.type === 'confirmation') return runtime().VK_BOT_CONFIRMATION!;
  if (!['message_new', 'message_allow', 'message_deny'].includes(update.type))
    return 'ok';
  const message = update.object?.message;
  const person = Number(
    update.type === 'message_new' ? message?.from_id : update.object?.user_id,
  );
  if (
    !Number.isSafeInteger(person) ||
    person <= 0 ||
    (update.type === 'message_new' &&
      (Number(message?.peer_id) !== person || message?.out))
  )
    return 'ok';
  const command =
    /^\s*(?:подключить|\/start)\s+([A-Za-z0-9_-]{20,80})\s*$/iu.exec(
      String(message?.text || ''),
    );
  const token =
    command?.[1] ||
    (/^\s*начать\s*$/iu.test(String(message?.text || '')) &&
    /^[A-Za-z0-9_-]{20,80}$/.test(message?.ref || '')
      ? message.ref
      : '');
  if (update.type === 'message_new' && !token) return 'ok';
  if (update.type !== 'message_deny') {
    const permission = await vkBotApi('messages.isMessagesFromGroupAllowed', {
      group_id: runtime().VK_BOT_GROUP_ID!,
      user_id: person,
    });
    if (Number(permission?.is_allowed) !== 1) return 'ok';
  }
  const event = String(update.event_id || (await hash(JSON.stringify(update))));
  if (event.length > 200) throw new ApiError('Некорректное событие');
  await db().transaction(async (tx) => {
    const fresh = await tx
      .prepare(
        'INSERT INTO vk_bot_events(event_id,created_at) VALUES(?,?) ON CONFLICT DO NOTHING RETURNING event_id',
      )
      .bind(event, now())
      .first();
    if (!fresh) return;
    await tx
      .prepare('SELECT pg_advisory_xact_lock(hashtext(?))')
      .bind(`vk-bot:${person}`)
      .first();
    if (update.type === 'message_deny') {
      await tx
        .prepare('UPDATE vk_bot_accounts SET disabled_at=? WHERE vk_user_id=?')
        .bind(now(), person)
        .run();
      return;
    }
    if (update.type === 'message_allow') {
      await tx
        .prepare(
          'UPDATE vk_bot_accounts SET disabled_at=NULL WHERE vk_user_id=?',
        )
        .bind(person)
        .run();
      return;
    }
    const tokenHash = await hash(token);
    const account = await tx
      .prepare(
        'SELECT user_id FROM vk_bot_accounts WHERE link_token_hash=? AND link_expires_at>? FOR UPDATE',
      )
      .bind(tokenHash, now())
      .first<{ user_id: string }>();
    if (!account) return;
    const owner = await tx
      .prepare(
        'SELECT user_id AS id FROM vk_bot_accounts WHERE vk_user_id=? UNION SELECT id FROM users WHERE identity=?',
      )
      .bind(person, `vk:${person}`)
      .all<{ id: string }>();
    if (owner.results.some((row) => row.id !== account.user_id))
      throw new ApiError(
        'Этот аккаунт ВК уже подключён к другому профилю',
        409,
      );
    await tx
      .prepare(
        'UPDATE vk_bot_accounts SET vk_user_id=?,linked_at=?,disabled_at=NULL,link_token_hash=NULL,link_expires_at=NULL WHERE user_id=?',
      )
      .bind(person, now(), account.user_id)
      .run();
    await tx
      .prepare(
        `INSERT INTO vk_bot_outbox(dedup_key,user_id,recipient_id,message,next_attempt_at) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING`,
      )
      .bind(
        `linked:${event}`,
        account.user_id,
        person,
        'ВК подключён к AniMonster. Теперь выбирайте уведомления на страницах аниме или в настройках профиля.',
        now(),
      )
      .run();
  });
  return 'ok';
}
export async function runVkNotifications(limit = 50) {
  if (!vkBotReady()) return { queued: 0, sent: 0, failed: 0 };
  const stamp = now();
  // Reconcile persisted episode availability, so an interrupted provider scan
  // cannot permanently lose a notification between discovery and queueing.
  const queued = await db()
    .prepare(`INSERT INTO vk_bot_outbox(dedup_key,user_id,recipient_id,anime_id,episode,message,free_at,next_attempt_at)
    SELECT 'episode:'||s.user_id||':'||s.anime_id||':'||e.episode,s.user_id,a.vk_user_id,s.anime_id,e.episode,
    'Новая серия на AniMonster: '||s.title||' — серия '||e.episode||chr(10)||?::text||'/anime/'||s.anime_id||chr(63)||'episode='||e.episode,e.free_at,?
    FROM vk_bot_subscriptions s JOIN vk_bot_accounts a ON a.user_id=s.user_id
    JOIN anime_episode_availability e ON e.anime_id=s.anime_id AND e.first_seen_at>=s.created_at
    WHERE a.vk_user_id IS NOT NULL AND a.disabled_at IS NULL AND (
      EXISTS(SELECT 1 FROM grants g WHERE g.user_id=s.user_id AND g.revoked_at IS NULL AND (g.expires>? OR g.lifetime))
      OR (SELECT count(*) FROM vk_bot_subscriptions x WHERE x.user_id=s.user_id AND (x.created_at<s.created_at OR (x.created_at=s.created_at AND x.anime_id<=s.anime_id)))<=3)
    ON CONFLICT(dedup_key) DO NOTHING`)
    .bind(
      (runtime().SITE_URL || 'https://animonster.su').replace(/\/$/, ''),
      stamp,
      stamp,
    )
    .run();
  const candidates = await db()
    .prepare(`SELECT d.id FROM vk_bot_outbox d JOIN vk_bot_accounts a ON a.user_id=d.user_id AND a.vk_user_id=d.recipient_id
    WHERE a.disabled_at IS NULL AND ((d.status IN ('pending','retry') AND d.next_attempt_at<=?) OR (d.status='sending' AND (d.claimed_at IS NULL OR d.claimed_at<?)))
    AND (d.anime_id IS NULL OR EXISTS(SELECT 1 FROM vk_bot_subscriptions s WHERE s.user_id=d.user_id AND s.anime_id=d.anime_id))
    AND (d.free_at<=? OR EXISTS(SELECT 1 FROM grants g WHERE g.user_id=d.user_id AND g.revoked_at IS NULL AND (g.expires>? OR g.lifetime)))
    ORDER BY d.next_attempt_at,d.id LIMIT ?`)
    .bind(
      stamp,
      stamp - 300000,
      stamp,
      stamp,
      Math.max(1, Math.min(50, Math.floor(limit))),
    )
    .all<{ id: number }>();
  let sent = 0,
    failed = 0;
  for (const candidate of candidates.results) {
    const lease = crypto.randomUUID();
    const job = await db()
      .prepare(`UPDATE vk_bot_outbox SET status='sending',lease_token=?,claimed_at=?,attempts=attempts+1
      WHERE id=? AND ((status IN ('pending','retry') AND next_attempt_at<=?) OR (status='sending' AND (claimed_at IS NULL OR claimed_at<?)))
      RETURNING id,user_id,recipient_id,message,attempts`)
      .bind(lease, now(), candidate.id, now(), now() - 300000)
      .first<{
        id: number;
        user_id: string;
        recipient_id: string;
        message: string;
        attempts: number;
      }>();
    if (!job) continue;
    try {
      const result = await vkBotApi('messages.send', {
        peer_id: job.recipient_id,
        random_id: job.id,
        message: job.message,
        dont_parse_links: 1,
      });
      if (!Number.isSafeInteger(result) || result <= 0)
        throw new Error('VK did not confirm message delivery');
      await db()
        .prepare(
          "UPDATE vk_bot_outbox SET status='sent',sent_at=?,lease_token=NULL,claimed_at=NULL,last_error=NULL WHERE id=? AND lease_token=? AND status='sending'",
        )
        .bind(now(), job.id, lease)
        .run();
      sent++;
    } catch (error) {
      const denied =
        error instanceof VkBotError && [18, 901, 902].includes(error.code);
      await db().transaction(async (tx) => {
        const owned = await tx
          .prepare(
            "UPDATE vk_bot_outbox SET status=?,next_attempt_at=?,last_error=?,lease_token=NULL,claimed_at=NULL WHERE id=? AND lease_token=? AND status='sending' RETURNING id",
          )
          .bind(
            denied ? 'disabled' : 'retry',
            now() +
              Math.min(
                3600000,
                60000 * 2 ** Math.min(6, Math.max(0, job.attempts - 1)),
              ),
            error instanceof Error
              ? error.message.slice(0, 200)
              : 'VK delivery failed',
            job.id,
            lease,
          )
          .first();
        if (owned && denied)
          await tx
            .prepare(
              'UPDATE vk_bot_accounts SET disabled_at=? WHERE user_id=? AND vk_user_id=?',
            )
            .bind(now(), job.user_id, job.recipient_id)
            .run();
      });
      failed++;
    }
  }
  await db()
    .prepare('DELETE FROM vk_bot_events WHERE created_at<?')
    .bind(now() - 30 * 86400000)
    .run();
  return { queued: Number(queued.meta?.changes || 0), sent, failed };
}
