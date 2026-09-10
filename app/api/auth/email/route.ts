import bcrypt from 'bcryptjs';
import {
  db,
  body,
  sameOrigin,
  hash,
  uid,
  now,
  json,
  fail,
  ApiError,
} from '@/lib/server/core';
export async function POST(r: Request) {
  try {
    sameOrigin(r);
    const b = await body(r),
      email = String(b.email || '')
        .trim()
        .toLowerCase(),
      password = String(b.password || '');
    if (
      !['login', 'register'].includes(b.action) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 ||
      password.length < 10 ||
      bcrypt.truncates(password)
    )
      throw new ApiError(
        'Укажите email и пароль от 10 символов, не длиннее 72 байт.',
      );
    const n = now();
    const keys = await Promise.all(
      [
        'email:' + email,
        'ip:' + (r.headers.get('cf-connecting-ip') || 'local'),
      ].map(hash),
    );
    for (const key of keys) {
      const row = await db()
        .prepare(
          'INSERT INTO auth_limits(key,attempts,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires<? THEN 1 ELSE attempts+1 END,expires=CASE WHEN expires<? THEN excluded.expires ELSE expires END RETURNING attempts',
        )
        .bind(key, n + 900000, n, n)
        .first<{ attempts: number }>();
      if ((row?.attempts || 0) > 20)
        throw new ApiError(
          'Слишком много попыток. Попробуйте через 15 минут.',
          429,
        );
    }
    let account = await db()
      .prepare('SELECT id,password_hash FROM users WHERE email=?')
      .bind(email)
      .first<{ id: string; password_hash: string }>();
    if (b.action === 'register') {
      if (account)
        throw new ApiError(
          'Не удалось создать аккаунт. Попробуйте войти.',
          409,
        );
      const nick = String(b.nick || '').trim();
      if (!/^[\p{L}\p{N}_-]{3,24}$/u.test(nick))
        throw new ApiError('Ник: 3–24 буквы, цифры, дефис или подчёркивание.');
      if (
        await db()
          .prepare('SELECT id FROM users WHERE nick=?')
          .bind(nick)
          .first()
      )
        throw new ApiError('Этот ник уже занят.', 409);
      const id = uid(),
        passwordHash = await bcrypt.hash(password, 12);
      await db()
        .prepare(
          'INSERT INTO users(id,identity,email,password_hash,nick,created_at) VALUES (?,?,?,?,?,?)',
        )
        .bind(id, 'email:' + email, email, passwordHash, nick, n)
        .run();
      account = { id, password_hash: passwordHash };
    } else {
      const valid = await bcrypt.compare(
        password,
        account?.password_hash ||
          '$2b$12$C6UzMDM.H6dfI/f/IKcEe.5n4IQWpUwgMhsOpFHlLdJvhbFkKgauO',
      );
      if (!account || !valid)
        throw new ApiError('Неверный email или пароль.', 401);
    }
    const token = uid() + uid();
    await db().batch([
      db().prepare('DELETE FROM sessions WHERE expires<?').bind(n),
      db()
        .prepare('INSERT INTO sessions(hash,user_id,expires) VALUES (?,?,?)')
        .bind(await hash(token), account.id, n + 2592000000),
    ]);
    const secure = new URL(r.url).protocol === 'https:' ? '; Secure' : '';
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Set-Cookie': `am_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}`,
      },
    });
  } catch (e) {
    return fail(e);
  }
}
