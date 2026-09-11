import bcrypt from 'bcryptjs';
import { db, body, sameOrigin, hash, uid, now, json, fail, ApiError, base } from '@/lib/server/core';
import { sendMail } from '@/lib/server/email';

const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
const validPassword = (value: string) => value.length >= 10 && !bcrypt.truncates(value);

async function limit(r: Request, email: string) {
  const n = now();
  const ip = r.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || r.headers.get('x-real-ip') || 'local';
  for (const key of await Promise.all(['email:' + email, 'ip:' + ip].map(hash))) {
    const row = await db().prepare(
      'INSERT INTO auth_limits(key,attempts,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN auth_limits.expires<? THEN 1 ELSE auth_limits.attempts+1 END,expires=CASE WHEN auth_limits.expires<? THEN excluded.expires ELSE auth_limits.expires END RETURNING attempts',
    ).bind(key, n + 900000, n, n).first<{ attempts: number }>();
    if ((row?.attempts || 0) > 20) throw new ApiError('Слишком много попыток. Попробуйте через 15 минут.', 429, 'rate_limited');
  }
}

async function verification(userId: string, email: string, tolerateDeliveryFailure = false) {
  const token = uid() + uid();
  await db().prepare('DELETE FROM email_tokens WHERE user_id=? AND purpose=?').bind(userId, 'verify').run();
  await db().prepare('INSERT INTO email_tokens(hash,user_id,purpose,expires_at) VALUES (?,?,?,?)')
    .bind(await hash(token), userId, 'verify', now() + 86400000).run();
  try {
    await sendMail(email, 'Подтвердите email в AniMonster', 'Подтвердите адрес, чтобы войти в закрытую бету AniMonster.', {
      label: 'Подтвердить email', url: `${base()}/api/auth/email/verify?token=${encodeURIComponent(token)}`,
    });
    return true;
  } catch (error) {
    if (!tolerateDeliveryFailure) throw error;
    return false;
  }
}

export async function POST(r: Request) {
  try {
    sameOrigin(r);
    const b = await body(r);
    const action = String(b.action || '');
    const email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');
    if (!['login', 'register', 'resend'].includes(action) || !validEmail(email))
      throw new ApiError('Проверьте email и данные формы.');
    await limit(r, email);
    let account = await db().prepare('SELECT id,password_hash,email_verified FROM users WHERE email=?')
      .bind(email).first<{ id: string; password_hash: string; email_verified: number }>();

    if (action === 'resend') {
      if (account && !account.email_verified) await verification(account.id, email);
      return json({ ok: true, message: 'Если аккаунт существует, письмо отправлено.' });
    }

    if (!validPassword(password))
      throw new ApiError('Пароль: от 10 символов, не длиннее 72 байт.');
    if (action === 'register') {
      if (account) throw new ApiError('Не удалось создать аккаунт. Попробуйте войти.', 409, 'account_exists');
      const nick = String(b.nick || '').trim();
      const invite = String(b.invite || '').trim().toUpperCase();
      if (!/^[\p{L}\p{N}_-]{3,24}$/u.test(nick)) throw new ApiError('Ник: 3–24 буквы, цифры, дефис или подчёркивание.');
      if (!/^[A-Z0-9-]{8,64}$/.test(invite)) throw new ApiError('Нужен действующий код приглашения.', 403, 'invite_required');
      const id = uid();
      const created = await db().prepare(
        `WITH claimed AS (
          UPDATE invites SET used_by=?,used_at=? WHERE hash=? AND used_by IS NULL AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?) RETURNING hash
        ) INSERT INTO users(id,identity,email,password_hash,nick,created_at)
          SELECT ?,?,?,?,?,? FROM claimed RETURNING id`,
      ).bind(id, now(), await hash(invite), now(), id, 'email:' + email, email, await bcrypt.hash(password, 12), nick, now()).first<{ id: string }>();
      if (!created) throw new ApiError('Код приглашения недействителен или уже использован.', 403, 'invalid_invite');
      account = { id, password_hash: '', email_verified: 0 };
      const delivered = await verification(id, email, true);
      const session = uid() + uid();
      const n = now();
      await db().prepare('INSERT INTO sessions(hash,user_id,user_agent,ip_hash,created_at,last_seen_at,expires) VALUES (?,?,?,?,?,?,?)')
        .bind(await hash(session), id, r.headers.get('user-agent')?.slice(0, 250) || '', await hash(r.headers.get('x-forwarded-for') || 'local'), n, n, n + 2592000000).run();
      const secure = new URL(r.url).protocol === 'https:' ? '; Secure' : '';
      return new Response(JSON.stringify({ ok: true, pending_verification: true, email_delivered: delivered, message: delivered ? 'Аккаунт создан. Подтвердите email по ссылке в письме.' : 'Аккаунт создан, но письмо не отправлено. Запросите его повторно позже.' }), { status: 201, headers: {
        'Content-Type': 'application/json', 'Cache-Control': 'no-store',
        'Set-Cookie': `am_session=${session}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}`,
      } });
    }

    const valid = await bcrypt.compare(password, account?.password_hash || '$2b$12$C6UzMDM.H6dfI/f/IKcEe.5n4IQWpUwgMhsOpFHlLdJvhbFkKgauO');
    if (!account || !valid) throw new ApiError('Неверный email или пароль.', 401, 'invalid_credentials');
    if (!account.email_verified) throw new ApiError('Сначала подтвердите email. Письмо можно отправить повторно.', 403, 'email_not_verified');
    const token = uid() + uid();
    const n = now();
    await db().batch([
      db().prepare('DELETE FROM sessions WHERE expires<?').bind(n),
      db().prepare('INSERT INTO sessions(hash,user_id,user_agent,ip_hash,created_at,last_seen_at,expires) VALUES (?,?,?,?,?,?,?)')
        .bind(await hash(token), account.id, r.headers.get('user-agent')?.slice(0, 250) || '', await hash(r.headers.get('x-forwarded-for') || 'local'), n, n, n + 2592000000),
    ]);
    const secure = new URL(r.url).protocol === 'https:' ? '; Secure' : '';
    return new Response(JSON.stringify({ ok: true }), { headers: {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store',
      'Set-Cookie': `am_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}`,
    } });
  } catch (e) { return fail(e); }
}
