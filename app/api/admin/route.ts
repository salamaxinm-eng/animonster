import { ApiError, body, db, fail, hash, isModerator, json, now, premium, sameOrigin, uid, viewer } from '@/lib/server/core';
import { dashboard } from '@/lib/server/admin';

async function moderator(r: Request) {
  const user = await viewer(r);
  if (!isModerator(user)) throw new ApiError('Не найдено', 404, 'not_found');
  return user!;
}
async function audit(actor: string, action: string, target?: string, reason = '', metadata = '{}') {
  await db().prepare('INSERT INTO moderation_actions(id,actor_id,target_user_id,action,reason,metadata,created_at) VALUES (?,?,?,?,?,?,?)')
    .bind(uid(), actor, target || null, action, reason, metadata, now()).run();
}
export async function GET(r: Request) {
  try {
    const actor = await moderator(r);
    const [invites, users, reports, actions, metrics] = await Promise.all([
      db().prepare('SELECT label,created_at,expires_at,used_by,used_at,revoked_at FROM invites ORDER BY created_at DESC LIMIT 50').all(),
      db().prepare(`SELECT u.id,u.nick,u.email,u.role,u.email_verified,u.suspended_until,u.created_at,
        (SELECT MAX(g.expires) FROM grants g WHERE g.user_id=u.id AND g.revoked_at IS NULL) AS premium_until
        FROM users u WHERE u.deleted_at IS NULL ORDER BY u.created_at DESC LIMIT 100`).all(),
      db().prepare(`SELECT r.*,c.body,u.nick AS reporter FROM reports r JOIN comments c ON c.id=r.comment_id JOIN users u ON u.id=r.user_id ORDER BY r.created_at DESC LIMIT 100`).all(),
      db().prepare('SELECT action,reason,target_user_id,created_at FROM moderation_actions ORDER BY created_at DESC LIMIT 50').all(),
      dashboard(),
    ]);
    return json({ can_manage_roles: actor.role === 'admin', dashboard: metrics, invites: invites.results, users: users.results, reports: reports.results, actions: actions.results });
  } catch (e) { return fail(e); }
}
export async function POST(r: Request) {
  try {
    sameOrigin(r);
    const actor = await moderator(r);
    const b = await body(r);
    const action = String(b.action || '');
    if (action === 'create_invite') {
      const code = `AM-${crypto.getRandomValues(new Uint32Array(2)).join('-').toUpperCase()}`;
      const days = Math.min(90, Math.max(1, Number(b.days) || 14));
      await db().prepare('INSERT INTO invites(hash,label,created_by,created_at,expires_at) VALUES (?,?,?,?,?)')
        .bind(await hash(code), String(b.label || 'Бета').slice(0, 80), actor.id, now(), now() + days * 86400000).run();
      await audit(actor.id, 'invite.create', undefined, '', JSON.stringify({ days }));
      return json({ ok: true, code });
    }
    const target = String(b.user_id || '');
    const exists = await db().prepare('SELECT id,role FROM users WHERE id=?').bind(target).first<{ id: string; role: string }>();
    if (!exists) throw new ApiError('Пользователь не найден', 404);
    if (action === 'grant_plus') {
      const days = Math.min(366, Math.max(1, Number(b.days) || 31));
      const id = `manual:${uid()}`;
      const start = now();
      const expires = Math.max(start, await premium(target)) + days * 86400000;
      await db().prepare('INSERT INTO grants(order_id,user_id,starts_at,expires,created_by,reason) VALUES (?,?,?,?,?,?)')
        .bind(id, target, start, expires, actor.id, String(b.reason || 'Закрытая бета').slice(0, 200)).run();
      await audit(actor.id, 'plus.grant', target, String(b.reason || ''), JSON.stringify({ days }));
      return json({ ok: true, premium_until: expires });
    }
    if (action === 'suspend') {
      const hours = Math.min(8760, Math.max(0, Number(b.hours) || 0));
      await db().prepare('UPDATE users SET suspended_until=? WHERE id=?').bind(hours ? now() + hours * 3600000 : null, target).run();
      await db().prepare('DELETE FROM sessions WHERE user_id=?').bind(target).run();
      await audit(actor.id, hours ? 'user.suspend' : 'user.unsuspend', target, String(b.reason || '').slice(0, 300), JSON.stringify({ hours }));
      return json({ ok: true });
    }
    if (action === 'role') {
      if (actor.role !== 'admin') throw new ApiError('Только администратор меняет роли', 403);
      const role = String(b.role || '');
      if (!['user', 'moderator', 'admin'].includes(role)) throw new ApiError('Неизвестная роль');
      await db().prepare('UPDATE users SET role=? WHERE id=?').bind(role, target).run();
      await audit(actor.id, 'user.role', target, '', JSON.stringify({ role }));
      return json({ ok: true });
    }
    throw new ApiError('Неизвестное действие', 404);
  } catch (e) { return fail(e); }
}
