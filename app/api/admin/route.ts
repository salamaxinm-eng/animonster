import {
  ApiError,
  body,
  db,
  fail,
  hash,
  inviteRequired,
  isModerator,
  json,
  now,
  premium,
  runtime,
  sameOrigin,
  uid,
  viewer,
} from '@/lib/server/core';
import { dashboard } from '@/lib/server/admin';
import { validSegment } from '@/lib/server/skip-times';

async function moderator(r: Request) {
  const user = await viewer(r);
  if (!isModerator(user)) throw new ApiError('Не найдено', 404, 'not_found');
  return user!;
}
async function audit(
  actor: string,
  action: string,
  target?: string,
  reason = '',
  metadata = '{}',
) {
  await db()
    .prepare(
      'INSERT INTO moderation_actions(id,actor_id,target_user_id,action,reason,metadata,created_at) VALUES (?,?,?,?,?,?,?)',
    )
    .bind(uid(), actor, target || null, action, reason, metadata, now())
    .run();
}
export async function GET(r: Request) {
  try {
    const actor = await moderator(r);
    const [
      invites,
      users,
      reports,
      actions,
      skipOverrides,
      comments,
      metrics,
      editorialCollections,
      characters,
      telegramQueue,
      episodeAccess,
      payments,
      plusState,
    ] = await Promise.all([
      db()
        .prepare(
          'SELECT label,created_at,expires_at,used_by,used_at,revoked_at FROM invites ORDER BY created_at DESC LIMIT 50',
        )
        .all(),
      db()
        .prepare(`SELECT u.id,u.nick,u.email,u.role,u.email_verified,u.suspended_until,u.created_at,
        (SELECT MAX(g.expires) FROM grants g WHERE g.user_id=u.id AND g.revoked_at IS NULL) AS premium_until
        FROM users u WHERE u.deleted_at IS NULL ORDER BY u.created_at DESC LIMIT 100`)
        .all(),
      db()
        .prepare(
          `SELECT r.*,c.body,u.nick AS reporter FROM reports r JOIN comments c ON c.id=r.comment_id JOIN users u ON u.id=r.user_id ORDER BY r.created_at DESC LIMIT 100`,
        )
        .all(),
      db()
        .prepare(
          'SELECT action,reason,target_user_id,created_at FROM moderation_actions ORDER BY created_at DESC LIMIT 50',
        )
        .all(),
      db()
        .prepare(
          'SELECT id,anime_id,episode,voiceover,opening_start,opening_stop,ending_start,ending_stop,updated_at FROM skip_time_overrides ORDER BY updated_at DESC LIMIT 100',
        )
        .all(),
      db()
        .prepare(
          `SELECT c.id,c.scope,c.body,c.created_at,u.id AS user_id,u.nick
             FROM comments c JOIN users u ON u.id=c.author_id
             WHERE c.deleted=0 ORDER BY c.created_at DESC LIMIT 100`,
        )
        .all(),
      dashboard(),
      db()
        .prepare(
          `SELECT c.*,COALESCE(string_agg(i.anime_id::text,',' ORDER BY i.position),'') AS anime_ids
             FROM editorial_collections c LEFT JOIN editorial_collection_items i ON i.collection_id=c.id
             GROUP BY c.id ORDER BY c.updated_at DESC`,
        )
        .all(),
      db()
        .prepare(
          'SELECT id,name,image,anime_id,active,created_at FROM characters ORDER BY created_at DESC',
        )
        .all(),
      db()
        .prepare(
          `SELECT status,count(*) AS count FROM telegram_deliveries GROUP BY status ORDER BY status`,
        )
        .all(),
      db()
        .prepare(
          `SELECT count(*) AS episodes,MAX(first_seen_at) AS last_seen,MIN(free_at) FILTER (WHERE free_at>?) AS next_free FROM episode_availability`,
        )
        .bind(now())
        .first(),
      db()
        .prepare(
          `SELECT g.order_id AS id,COALESCE(o.status,'manual') AS status,g.starts_at AS created_at,g.user_id,u.nick,g.expires,g.created_by,g.reason
             FROM grants g JOIN users u ON u.id=g.user_id LEFT JOIN orders o ON o.id=g.order_id
             WHERE g.revoked_at IS NULL ORDER BY g.starts_at DESC LIMIT 100`,
        )
        .all(),
      db()
        .prepare(
          "SELECT value,updated_at FROM plus_system_state WHERE key='episode_bootstrap'",
        )
        .first(),
    ]);
    return json({
      can_manage_roles: actor.role === 'admin',
      invite_required: inviteRequired(),
      dashboard: metrics,
      invites: invites.results,
      users: users.results,
      reports: reports.results,
      actions: actions.results,
      skip_overrides: skipOverrides.results,
      comments: comments.results,
      editorial_collections: editorialCollections.results,
      characters: characters.results,
      telegram_queue: telegramQueue.results,
      episode_access: episodeAccess,
      payments: payments.results,
      plus_state: plusState,
      plus_early_access_enabled: runtime().PLUS_EARLY_ACCESS_ENABLED === 'true',
    });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(r: Request) {
  try {
    sameOrigin(r);
    const actor = await moderator(r);
    const b = await body(r);
    const action = String(b.action || '');
    if (action === 'create_invite') {
      if (!inviteRequired())
        throw new ApiError(
          'Приглашения сейчас отключены.',
          409,
          'invites_disabled',
        );
      const code = `AM-${crypto.getRandomValues(new Uint32Array(2)).join('-').toUpperCase()}`;
      const days = Math.min(90, Math.max(1, Number(b.days) || 14));
      await db()
        .prepare(
          'INSERT INTO invites(hash,label,created_by,created_at,expires_at) VALUES (?,?,?,?,?)',
        )
        .bind(
          await hash(code),
          String(b.label || 'Бета').slice(0, 80),
          actor.id,
          now(),
          now() + days * 86400000,
        )
        .run();
      await audit(
        actor.id,
        'invite.create',
        undefined,
        '',
        JSON.stringify({ days }),
      );
      return json({ ok: true, code });
    }
    if (action === 'skip_override') {
      const animeId = Number(b.anime_id),
        episode = Number(b.episode),
        voiceover =
          String(b.voiceover || '*')
            .trim()
            .slice(0, 100) || '*';
      if (!Number.isInteger(animeId) || animeId < 1 || animeId > 999999999)
        throw new ApiError('Некорректное аниме');
      if (!Number.isInteger(episode) || episode < 1 || episode > 100000)
        throw new ApiError('Некорректная серия');
      const readSegment = (prefix: 'opening' | 'ending') => {
        const startValue = b[`${prefix}_start`],
          stopValue = b[`${prefix}_stop`];
        if (
          (startValue == null || startValue === '') &&
          (stopValue == null || stopValue === '')
        )
          return undefined;
        const segment = validSegment({ start: startValue, stop: stopValue }, 0);
        if (!segment)
          throw new ApiError(
            `Некорректный ${prefix === 'opening' ? 'опенинг' : 'эндинг'}`,
          );
        return segment;
      };
      const opening = readSegment('opening'),
        ending = readSegment('ending');
      if (!opening && !ending)
        throw new ApiError('Укажите хотя бы один интервал');
      const id = uid();
      await db()
        .prepare(
          `INSERT INTO skip_time_overrides(id,anime_id,episode,voiceover,opening_start,opening_stop,ending_start,ending_stop,created_by,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(anime_id,episode,voiceover) DO UPDATE SET opening_start=excluded.opening_start,opening_stop=excluded.opening_stop,ending_start=excluded.ending_start,ending_stop=excluded.ending_stop,created_by=excluded.created_by,updated_at=excluded.updated_at`,
        )
        .bind(
          id,
          animeId,
          episode,
          voiceover,
          opening?.start ?? null,
          opening?.stop ?? null,
          ending?.start ?? null,
          ending?.stop ?? null,
          actor.id,
          now(),
        )
        .run();
      await audit(
        actor.id,
        'skip.override',
        undefined,
        '',
        JSON.stringify({ anime_id: animeId, episode, voiceover }),
      );
      return json({ ok: true });
    }
    if (action === 'skip_override_delete') {
      const id = String(b.id || '');
      const existingOverride = await db()
        .prepare(
          'SELECT anime_id,episode,voiceover FROM skip_time_overrides WHERE id=?',
        )
        .bind(id)
        .first();
      if (!existingOverride) throw new ApiError('Таймкод не найден', 404);
      await db()
        .prepare('DELETE FROM skip_time_overrides WHERE id=?')
        .bind(id)
        .run();
      await audit(
        actor.id,
        'skip.override.delete',
        undefined,
        '',
        JSON.stringify(existingOverride),
      );
      return json({ ok: true });
    }
    if (action === 'editorial_save') {
      const title = String(b.title || '')
        .trim()
        .slice(0, 120);
      const description = String(b.description || '')
        .trim()
        .slice(0, 800);
      const cover =
        String(b.cover || '')
          .trim()
          .slice(0, 1000) || null;
      const animeIds = [
        ...new Set(
          String(b.anime_ids || '')
            .split(/[\s,]+/)
            .map(Number)
            .filter((id) => Number.isInteger(id) && id > 0),
        ),
      ].slice(0, 100);
      if (title.length < 2) throw new ApiError('Укажите название подборки');
      if (cover && !cover.startsWith('https://'))
        throw new ApiError('Обложка должна быть HTTPS-ссылкой');
      const id = String(b.id || '') || uid();
      await db().batch([
        db()
          .prepare(
            `INSERT INTO editorial_collections(id,title,description,cover,published,created_by,created_at,updated_at)
             VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,cover=excluded.cover,published=excluded.published,updated_at=excluded.updated_at`,
          )
          .bind(
            id,
            title,
            description,
            cover,
            b.published ? 1 : 0,
            actor.id,
            now(),
            now(),
          ),
        db()
          .prepare(
            'DELETE FROM editorial_collection_items WHERE collection_id=?',
          )
          .bind(id),
        ...animeIds.map((animeId, position) =>
          db()
            .prepare(
              'INSERT INTO editorial_collection_items(collection_id,anime_id,position) VALUES (?,?,?)',
            )
            .bind(id, animeId, position),
        ),
      ]);
      await audit(
        actor.id,
        'editorial.save',
        undefined,
        '',
        JSON.stringify({ id }),
      );
      return json({ ok: true, id });
    }
    if (action === 'editorial_delete') {
      const id = String(b.id || '');
      await db()
        .prepare('DELETE FROM editorial_collections WHERE id=?')
        .bind(id)
        .run();
      await audit(
        actor.id,
        'editorial.delete',
        undefined,
        '',
        JSON.stringify({ id }),
      );
      return json({ ok: true });
    }
    if (action === 'character_save') {
      const name = String(b.name || '')
        .trim()
        .slice(0, 100);
      const image = String(b.image || '')
        .trim()
        .slice(0, 1000);
      const animeId = Number(b.anime_id) || null;
      if (name.length < 2 || !image.startsWith('https://'))
        throw new ApiError('Укажите имя и HTTPS-изображение персонажа');
      const id = String(b.id || '') || uid();
      await db()
        .prepare(
          `INSERT INTO characters(id,name,image,anime_id,active,created_at) VALUES (?,?,?,?,?,?)
           ON CONFLICT(id) DO UPDATE SET name=excluded.name,image=excluded.image,anime_id=excluded.anime_id,active=excluded.active`,
        )
        .bind(id, name, image, animeId, b.active === false ? 0 : 1, now())
        .run();
      await audit(
        actor.id,
        'character.save',
        undefined,
        '',
        JSON.stringify({ id }),
      );
      return json({ ok: true, id });
    }
    if (action === 'character_delete') {
      const id = String(b.id || '');
      await db().prepare('DELETE FROM characters WHERE id=?').bind(id).run();
      await audit(
        actor.id,
        'character.delete',
        undefined,
        '',
        JSON.stringify({ id }),
      );
      return json({ ok: true });
    }
    const target = String(b.user_id || '');
    const exists = await db()
      .prepare('SELECT id,role FROM users WHERE id=?')
      .bind(target)
      .first<{ id: string; role: string }>();
    if (!exists) throw new ApiError('Пользователь не найден', 404);
    if (action === 'grant_plus') {
      const days = Math.min(366, Math.max(1, Number(b.days) || 30));
      const id = `manual:${uid()}`;
      const start = now();
      const expires = Math.max(start, await premium(target)) + days * 86400000;
      await db()
        .prepare(
          'INSERT INTO grants(order_id,user_id,starts_at,expires,created_by,reason) VALUES (?,?,?,?,?,?)',
        )
        .bind(
          id,
          target,
          start,
          expires,
          actor.id,
          String(b.reason || 'Закрытая бета').slice(0, 200),
        )
        .run();
      await audit(
        actor.id,
        'plus.grant',
        target,
        String(b.reason || ''),
        JSON.stringify({ days }),
      );
      return json({ ok: true, premium_until: expires });
    }
    if (action === 'suspend') {
      const hours = Math.min(8760, Math.max(0, Number(b.hours) || 0));
      await db()
        .prepare('UPDATE users SET suspended_until=? WHERE id=?')
        .bind(hours ? now() + hours * 3600000 : null, target)
        .run();
      await db()
        .prepare('DELETE FROM sessions WHERE user_id=?')
        .bind(target)
        .run();
      await audit(
        actor.id,
        hours ? 'user.suspend' : 'user.unsuspend',
        target,
        String(b.reason || '').slice(0, 300),
        JSON.stringify({ hours }),
      );
      return json({ ok: true });
    }
    if (action === 'role') {
      if (actor.role !== 'admin')
        throw new ApiError('Только администратор меняет роли', 403);
      const role = String(b.role || '');
      if (!['user', 'moderator', 'admin'].includes(role))
        throw new ApiError('Неизвестная роль');
      await db()
        .prepare('UPDATE users SET role=? WHERE id=?')
        .bind(role, target)
        .run();
      await audit(actor.id, 'user.role', target, '', JSON.stringify({ role }));
      return json({ ok: true });
    }
    throw new ApiError('Неизвестное действие', 404);
  } catch (e) {
    return fail(e);
  }
}
