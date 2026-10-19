import { ApiError, db, now, uid, type User } from './core';
import type { SocialProvider } from '@/lib/social-auth';

export type SocialIdentity = {
  provider: SocialProvider;
  subject: string;
  name: string;
  email: string | null;
  telegramId: string | null;
};
export type SocialAccountOptions = {
  userId: string | null;
  sessionHash: string | null;
  inviteHash: string | null;
  inviteRequired: boolean;
};
export function assertSocialUser(user: User & { deleted_at?: number | null }) {
  if (
    user.deleted_at ||
    (user.suspended_until && Number(user.suspended_until) > now())
  )
    throw new ApiError('Вход ограничен', 403, 'social_blocked');
}

// Shared with notification linking: serialize ownership checks across both tables.
export async function lockTelegramAccount(
  connection: ReturnType<typeof db>,
  telegramId: string,
) {
  await connection
    .prepare('SELECT pg_advisory_xact_lock(hashtext(?))')
    .bind('social:telegram:' + telegramId)
    .first();
}

export async function socialAccount(
  identity: SocialIdentity,
  options: SocialAccountOptions,
) {
  return db().transaction(async (connection) => {
    const keys = [
      `social:identity:${identity.provider}:${identity.subject}`,
      ...(identity.email ? ['social:email:' + identity.email] : []),
      ...(identity.telegramId
        ? ['social:telegram:' + identity.telegramId]
        : []),
      ...(options.userId ? ['social:user:' + options.userId] : []),
    ].sort();
    for (const key of keys)
      await connection
        .prepare('SELECT pg_advisory_xact_lock(hashtext(?))')
        .bind(key)
        .first();
    let target: (User & { deleted_at?: number | null }) | null = null;
    if (options.userId) {
      target = await connection
        .prepare(`SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id
        WHERE u.id=? AND s.hash=? AND s.expires>? FOR UPDATE OF u`)
        .bind(options.userId, options.sessionHash, now())
        .first<User>();
      if (!target)
        throw new ApiError('Войдите снова', 401, 'social_session_expired');
      assertSocialUser(target);
    }
    const bound = await connection
      .prepare(`SELECT u.*,i.provider_account_id FROM auth_identities i JOIN users u ON u.id=i.user_id
      WHERE i.provider=? AND i.provider_user_id=?`)
      .bind(identity.provider, identity.subject)
      .first<User & { provider_account_id: string | null }>();
    const telegramOwner = identity.telegramId
      ? await connection
          .prepare(`SELECT u.* FROM users u WHERE u.id IN (
      SELECT user_id FROM telegram_accounts WHERE telegram_id=?::bigint
      UNION SELECT user_id FROM auth_identities WHERE provider='telegram' AND provider_account_id=?)`)
          .bind(identity.telegramId, identity.telegramId)
          .all<User>()
      : { results: [] as User[] };
    if (
      telegramOwner.results.length > 1 ||
      (bound &&
        identity.telegramId &&
        bound.provider_account_id &&
        bound.provider_account_id !== identity.telegramId)
    )
      throw new ApiError('Привязка конфликтует', 409, 'social_conflict');
    const existing = bound || telegramOwner.results[0] || null;
    if (existing) {
      assertSocialUser(existing);
      if (
        (target && target.id !== existing.id) ||
        (bound &&
          telegramOwner.results[0] &&
          bound.id !== telegramOwner.results[0].id)
      )
        throw new ApiError(
          'Уже подключён другой профиль',
          409,
          'social_conflict',
        );
      target ||= existing;
    }
    // Never merge an existing account solely on an email assertion from a provider.
    // Explicit linking requires the original active AniMonster session above.
    const emailOwner =
      identity.email && !bound
        ? await connection
            .prepare('SELECT id FROM users WHERE lower(email)=?')
            .bind(identity.email)
            .first<{ id: string }>()
        : null;
    if (emailOwner && emailOwner.id !== target?.id)
      throw new ApiError('Email уже используется', 409, 'social_email_exists');
    let created = false;
    if (!target) {
      const id = uid();
      if (options.inviteRequired) {
        if (!options.inviteHash)
          throw new ApiError(
            'Нужно приглашение',
            403,
            'social_invite_required',
          );
        const invite = await connection
          .prepare(`UPDATE invites SET used_by=?,used_at=? WHERE hash=? AND used_by IS NULL
          AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?) RETURNING hash`)
          .bind(id, now(), options.inviteHash, now())
          .first();
        if (!invite)
          throw new ApiError(
            'Приглашение недействительно',
            403,
            'social_invite_invalid',
          );
      }
      const nick =
        (identity.name.replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 12) ||
          'Monster') +
        '_' +
        id.replaceAll('-', '').slice(0, 10);
      target = await connection
        .prepare(`INSERT INTO users(id,identity,nick,email,email_verified,created_at)
        VALUES (?,?,?,?,?,?) RETURNING *`)
        .bind(
          id,
          identity.provider + ':' + identity.subject,
          nick,
          identity.email,
          identity.email ? 1 : 0,
          now(),
        )
        .first<User>();
      if (!target) throw new Error('Social account insert failed');
      created = true;
    }
    const currentProvider = await connection
      .prepare(
        'SELECT provider_user_id FROM auth_identities WHERE provider=? AND user_id=?',
      )
      .bind(identity.provider, target.id)
      .first<{ provider_user_id: string }>();
    if (
      currentProvider &&
      currentProvider.provider_user_id !== identity.subject
    )
      throw new ApiError('Другой аккаунт уже привязан', 409, 'social_conflict');
    await connection
      .prepare(`INSERT INTO auth_identities(provider,provider_user_id,user_id,created_at,provider_account_id) VALUES (?,?,?,?,?)
      ON CONFLICT(provider,provider_user_id) DO UPDATE SET provider_account_id=COALESCE(auth_identities.provider_account_id,excluded.provider_account_id)`)
      .bind(
        identity.provider,
        identity.subject,
        target.id,
        now(),
        identity.telegramId,
      )
      .run();
    if (
      identity.email &&
      options.userId &&
      (!target.email || target.email.toLowerCase() === identity.email)
    ) {
      await connection
        .prepare('UPDATE users SET email=?,email_verified=1 WHERE id=?')
        .bind(identity.email, target.id)
        .run();
    }
    return { id: target.id, created };
  });
}
