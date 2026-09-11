import bcrypt from 'bcryptjs';
import { db, body, sameOrigin, hash, uid, now, json, fail, ApiError, base } from '@/lib/server/core';
import { sendMail } from '@/lib/server/email';

export async function POST(r: Request) {
  try {
    sameOrigin(r);
    const b = await body(r);
    if (b.action === 'request') {
      const email = String(b.email || '').trim().toLowerCase();
      const user = await db().prepare('SELECT id FROM users WHERE email=? AND email_verified=1').bind(email).first<{ id: string }>();
      if (user) {
        const token = uid() + uid();
        await db().prepare('DELETE FROM email_tokens WHERE user_id=? AND purpose=?').bind(user.id, 'reset').run();
        await db().prepare('INSERT INTO email_tokens(hash,user_id,purpose,expires_at) VALUES (?,?,?,?)')
          .bind(await hash(token), user.id, 'reset', now() + 3600000).run();
        await sendMail(email, 'Восстановление пароля AniMonster', 'Ссылка действует один час.', {
          label: 'Задать новый пароль', url: `${base()}/reset-password?token=${encodeURIComponent(token)}`,
        });
      }
      return json({ ok: true, message: 'Если аккаунт существует, письмо отправлено.' });
    }
    if (b.action === 'reset') {
      const token = String(b.token || '');
      const password = String(b.password || '');
      if (password.length < 10 || bcrypt.truncates(password)) throw new ApiError('Пароль: от 10 символов, не длиннее 72 байт.');
      const user = await db().prepare(
        `UPDATE email_tokens SET used_at=? WHERE hash=? AND purpose='reset' AND used_at IS NULL AND expires_at>? RETURNING user_id`,
      ).bind(now(), await hash(token), now()).first<{ user_id: string }>();
      if (!user) throw new ApiError('Ссылка недействительна или устарела.', 400, 'invalid_reset_token');
      await db().batch([
        db().prepare('UPDATE users SET password_hash=? WHERE id=?').bind(await bcrypt.hash(password, 12), user.user_id),
        db().prepare('DELETE FROM sessions WHERE user_id=?').bind(user.user_id),
      ]);
      return json({ ok: true });
    }
    throw new ApiError('Неизвестное действие', 404);
  } catch (e) { return fail(e); }
}
