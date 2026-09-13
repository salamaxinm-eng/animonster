import { getAnime } from '@/lib/server/library';
import {
  db,
  isModerator,
  viewer,
  requireUser,
  runtime,
  publicUser,
  json,
  fail,
  body,
  sameOrigin,
  ApiError,
  now,
  uid,
  premium,
  inviteRequired,
  emailVerificationEnabled,
  type User,
} from '@/lib/server/core';
import { themes, avatars, pins } from '@/lib/community';
const validScope = (s: string) =>
  /^wall:[a-f0-9-]{36}$/.test(s) ||
  /^anime:\d{1,9}(?::episode:\d{1,5}|:video:\d{1,12})?$/.test(s);
async function blocked(a: string, b: string) {
  return !!(await db()
    .prepare(
      'SELECT 1 FROM blocks WHERE (user_id=? AND target_id=?) OR (user_id=? AND target_id=?)',
    )
    .bind(a, b, b, a)
    .first());
}
export async function GET(r: Request) {
  try {
    const u = await viewer(r),
      p = new URL(r.url).searchParams,
      action = p.get('action') || 'me';
    if (action === 'me')
      return json({
        user: u ? await publicUser(u) : null,
        preview: !!u?.identity.startsWith('preview:'),
        moderator: isModerator(u),
        vk_ready: !!runtime().VK_CLIENT_ID,
        invite_required: inviteRequired(),
        email_verification_required: emailVerificationEnabled(),
        payments_ready:
          runtime().PAYMENTS_ENABLED === 'true' &&
          !!runtime().YOOKASSA_SHOP_ID &&
          !!runtime().YOOKASSA_SECRET_KEY,
        support_url: runtime().TELEGRAM_URL || null,
      });
    if (action === 'profile') {
      const id = p.get('id') || u?.id;
      if (!id) throw new ApiError('Войдите в аккаунт', 401);
      const profile = await db()
        .prepare('SELECT * FROM users WHERE id=?')
        .bind(id)
        .first<User>();
      if (!profile) throw new ApiError('Профиль не найден', 404);
      const own = u?.id === id;
      const entries =
        own || profile.collection_public
          ? (
              await db()
                .prepare(
                  'SELECT * FROM collection WHERE user_id=? ORDER BY favorite DESC, title LIMIT 300',
                )
                .bind(id)
                .all()
            ).results
          : [];
      const lists =
        own || profile.collection_public
          ? (
              await db()
                .prepare(
                  'SELECT l.id,l.name,count(i.anime_id) AS item_count FROM collection_lists l LEFT JOIN collection_list_items i ON i.list_id=l.id WHERE l.user_id=? GROUP BY l.id,l.name,l.created_at ORDER BY l.created_at,l.name',
                )
                .bind(id)
                .all()
            ).results
          : [];
      const memberships =
        own || profile.collection_public
          ? (
              await db()
                .prepare(
                  'SELECT i.list_id,i.anime_id FROM collection_list_items i JOIN collection_lists l ON l.id=i.list_id WHERE l.user_id=?',
                )
                .bind(id)
                .all<{ list_id: string; anime_id: number }>()
            ).results
          : [];
      return json({
        user: await publicUser(profile),
        entries: entries.map((entry: any) => ({
          ...entry,
          list_ids: memberships
            .filter((item) => item.anime_id === entry.anime_id)
            .map((item) => item.list_id),
        })),
        lists,
        own,
        blocked: u ? await blocked(u.id, id) : false,
      });
    }
    if (action === 'comments') {
      const scope = p.get('scope') || '';
      if (!validScope(scope)) throw new ApiError('Неизвестное обсуждение');
      const order =
        p.get('sort') === 'popular'
          ? 'score DESC,c.created_at DESC'
          : 'c.created_at DESC';
      const rows = await db()
        .prepare(
          `SELECT c.*,u.nick,u.avatar,u.theme,CASE WHEN EXISTS(SELECT 1 FROM grants g WHERE g.user_id=u.id AND g.expires>?) THEN u.pin ELSE NULL END AS pin,(SELECT count(*) FROM likes l WHERE l.comment_id=c.id AND l.value=1) AS like_count,(SELECT count(*) FROM likes l WHERE l.comment_id=c.id AND l.value=-1) AS dislike_count,COALESCE((SELECT sum(value) FROM likes l WHERE l.comment_id=c.id),0) AS score,COALESCE((SELECT value FROM likes l WHERE l.comment_id=c.id AND l.user_id=?),0) AS vote FROM comments c JOIN users u ON u.id=c.author_id WHERE c.scope=? AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.user_id=? AND b.target_id=c.author_id) OR (b.user_id=c.author_id AND b.target_id=?)) ORDER BY c.pinned DESC,${order} LIMIT 100`,
        )
        .bind(now(), u?.id || '', scope, u?.id || '', u?.id || '')
        .all();
      return json(
        rows.results.map((c) =>
          c.deleted ? { ...c, body: 'Комментарий удалён', pin: null } : c,
        ),
      );
    }
    if (action === 'notifications') {
      if (!u) throw new ApiError('Войдите в аккаунт', 401);
      return json(
        (
          await db()
            .prepare(
              'SELECT n.*,u.nick FROM notifications n JOIN users u ON u.id=n.actor_id WHERE n.user_id=? ORDER BY n.created_at DESC LIMIT 50',
            )
            .bind(u.id)
            .all()
        ).results,
      );
    }
    if (action === 'blocks') {
      if (!u) throw new ApiError('Войдите в аккаунт', 401);
      return json(
        (
          await db()
            .prepare(
              'SELECT u.id,u.nick FROM blocks b JOIN users u ON u.id=b.target_id WHERE b.user_id=?',
            )
            .bind(u.id)
            .all()
        ).results,
      );
    }
    if (action === 'reports') {
      if (!u?.identity.startsWith('preview:'))
        throw new ApiError('Недостаточно прав', 403);
      return json(
        (
          await db()
            .prepare(
              'SELECT r.*,c.body,c.scope FROM reports r JOIN comments c ON c.id=r.comment_id WHERE r.resolved=0 ORDER BY r.created_at DESC LIMIT 100',
            )
            .all()
        ).results,
      );
    }
    throw new ApiError('Действие не найдено', 404);
  } catch (e) {
    return fail(e);
  }
}
export async function POST(r: Request) {
  try {
    sameOrigin(r);
    const u = await requireUser(r),
      b = await body(r);
    const action = b.action;
    if (action === 'adult_consent') {
      if (!b.confirmed) throw new ApiError('Подтверждение не сохранено');
      await db()
        .prepare('UPDATE users SET adult_confirmed_at=? WHERE id=?')
        .bind(now(), u.id)
        .run();
      return json({ ok: true });
    }
    if (action === 'playback_settings') {
      if (
        b.auto_skip_segments !== null &&
        typeof b.auto_skip_segments !== 'boolean'
      )
        throw new ApiError('Некорректная настройка воспроизведения');
      await db()
        .prepare('UPDATE users SET auto_skip_segments=? WHERE id=?')
        .bind(
          b.auto_skip_segments == null ? null : b.auto_skip_segments ? 1 : 0,
          u.id,
        )
        .run();
      return json({ ok: true, auto_skip_segments: b.auto_skip_segments });
    }
    if (action === 'profile') {
      const nick = String(b.nick || '').trim();
      if (!/^[\p{L}\p{N}_-]{3,24}$/u.test(nick))
        throw new ApiError('Ник: 3–24 буквы, цифры, дефис или _');
      const exists = await db()
        .prepare('SELECT id FROM users WHERE lower(nick)=lower(?) AND id<>?')
        .bind(nick, u.id)
        .first();
      if (exists) throw new ApiError('Этот ник уже занят', 409);
      const bio = String(b.bio || '').trim();
      if (bio.length > 400)
        throw new ApiError('Описание не длиннее 400 символов');
      const avatar = String(b.avatar || '');
      const customAvatar =
        avatar === u.avatar &&
        new RegExp(`^custom:${u.id.replaceAll('-', '\\-')}:\\d+$`).test(avatar);
      if (
        !themes.some((x) => x.id === b.theme) ||
        (!avatars.some((x) => x.id === avatar) && !customAvatar)
      )
        throw new ApiError('Неизвестное оформление');
      const pin = b.pin || null;
      if (pin && (!pins.some((x) => x.id === pin) || !(await premium(u.id))))
        throw new ApiError('Пины доступны по активной подписке', 403);
      const autoSkipSegments =
        b.auto_skip_segments == null
          ? (u.auto_skip_segments ?? null)
          : b.auto_skip_segments
            ? 1
            : 0;
      await db()
        .prepare(
          'UPDATE users SET nick=?,bio=?,theme=?,avatar=?,pin=?,wall_open=?,collection_public=?,auto_skip_segments=? WHERE id=?',
        )
        .bind(
          nick,
          bio,
          b.theme,
          avatar,
          pin,
          b.wall_open ? 1 : 0,
          b.collection_public ? 1 : 0,
          autoSkipSegments,
          u.id,
        )
        .run();
      if (!customAvatar)
        await db()
          .prepare('DELETE FROM user_avatars WHERE user_id=?')
          .bind(u.id)
          .run();
      return json({ ok: true });
    }
    if (action === 'favorite') {
      const id = Number(b.anime_id);
      if (!Number.isInteger(id) || id < 1)
        throw new ApiError('Некорректное аниме');
      if (!b.value) {
        await db()
          .prepare(
            'UPDATE collection SET favorite=0 WHERE user_id=? AND anime_id=?',
          )
          .bind(u.id, id)
          .run();
        return json({ ok: true });
      }
      const count = await db()
        .prepare(
          'SELECT count(*) AS n FROM collection WHERE user_id=? AND favorite=1 AND anime_id<>?',
        )
        .bind(u.id, id)
        .first<{ n: number }>();
      if ((count?.n || 0) >= 5)
        throw new ApiError('В витрине может быть пять любимых тайтлов');
      const item = await getAnime(id);
      if (!item) throw new ApiError('Аниме не найдено', 404);
      await db()
        .prepare(
          "INSERT INTO collection(user_id,anime_id,title,image,status,favorite) VALUES (?,?,?,?,'planned',1) ON CONFLICT(user_id,anime_id) DO UPDATE SET favorite=1",
        )
        .bind(u.id, id, item.anime.russian, item.anime.image.original)
        .run();
      return json({ ok: true });
    }
    if (action === 'collection') {
      const id = Number(b.anime_id);
      if (!Number.isInteger(id) || id < 1 || id > 999999999)
        throw new ApiError('Некорректный тайтл');
      if (b.remove) {
        await db().batch([
          db()
            .prepare(
              'DELETE FROM collection_list_items WHERE anime_id=? AND list_id IN (SELECT id FROM collection_lists WHERE user_id=?)',
            )
            .bind(id, u.id),
          db()
            .prepare('DELETE FROM collection WHERE user_id=? AND anime_id=?')
            .bind(u.id, id),
        ]);
        return json({ ok: true });
      }
      if (!['planned', 'watching', 'completed', 'dropped'].includes(b.status))
        throw new ApiError('Неизвестный статус');
      const rating = Number(b.rating || 0);
      if (!Number.isInteger(rating) || rating < 0 || rating > 10)
        throw new ApiError('Оценка от 1 до 10');
      const title = String(b.title || '')
          .trim()
          .slice(0, 200),
        image = String(b.image || '');
      if (
        !title ||
        !/^https:\/\/(shikimori\.one\/(system|assets)|api\.anilibria\.app\/storage)\//.test(
          image,
        )
      )
        throw new ApiError('Некорректный тайтл');
      if (b.favorite) {
        const count = await db()
          .prepare(
            'SELECT count(*) AS n FROM collection WHERE user_id=? AND favorite=1 AND anime_id<>?',
          )
          .bind(u.id, id)
          .first<{ n: number }>();
        if ((count?.n || 0) >= 5)
          throw new ApiError('В витрине может быть пять любимых тайтлов');
      }
      await db()
        .prepare(
          'INSERT INTO collection (user_id,anime_id,title,image,status,rating,favorite) VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id,anime_id) DO UPDATE SET title=excluded.title,image=excluded.image,status=excluded.status,rating=excluded.rating,favorite=excluded.favorite',
        )
        .bind(u.id, id, title, image, b.status, rating, b.favorite ? 1 : 0)
        .run();
      return json({ ok: true });
    }
    if (action === 'list_create') {
      const name = String(b.name || '')
        .trim()
        .replace(/\s+/g, ' ');
      if (name.length < 2 || name.length > 30)
        throw new ApiError('Название списка: от 2 до 30 символов');
      const count = await db()
        .prepare('SELECT count(*) AS n FROM collection_lists WHERE user_id=?')
        .bind(u.id)
        .first<{ n: number }>();
      if ((count?.n || 0) >= 12)
        throw new ApiError('Можно создать не больше 12 своих списков');
      const exists = await db()
        .prepare(
          'SELECT 1 FROM collection_lists WHERE user_id=? AND lower(name)=lower(?)',
        )
        .bind(u.id, name)
        .first();
      if (exists)
        throw new ApiError('Список с таким названием уже существует', 409);
      const id = uid();
      await db()
        .prepare(
          'INSERT INTO collection_lists(id,user_id,name,created_at) VALUES (?,?,?,?)',
        )
        .bind(id, u.id, name, now())
        .run();
      return json({ id, name, item_count: 0 });
    }
    if (action === 'list_delete') {
      const id = String(b.id || '');
      await db()
        .prepare('DELETE FROM collection_lists WHERE id=? AND user_id=?')
        .bind(id, u.id)
        .run();
      return json({ ok: true });
    }
    if (action === 'list_membership') {
      const listId = String(b.list_id || '');
      const animeId = Number(b.anime_id);
      if (!Number.isInteger(animeId) || animeId < 1)
        throw new ApiError('Некорректный тайтл');
      const list = await db()
        .prepare('SELECT 1 FROM collection_lists WHERE id=? AND user_id=?')
        .bind(listId, u.id)
        .first();
      if (!list) throw new ApiError('Список не найден', 404);
      const entry = await db()
        .prepare('SELECT 1 FROM collection WHERE user_id=? AND anime_id=?')
        .bind(u.id, animeId)
        .first();
      if (!entry) throw new ApiError('Сначала добавьте тайтл в коллекцию');
      if (b.value)
        await db()
          .prepare(
            'INSERT OR IGNORE INTO collection_list_items(list_id,anime_id) VALUES (?,?)',
          )
          .bind(listId, animeId)
          .run();
      else
        await db()
          .prepare(
            'DELETE FROM collection_list_items WHERE list_id=? AND anime_id=?',
          )
          .bind(listId, animeId)
          .run();
      return json({ ok: true });
    }
    if (action === 'comment') {
      const scope = String(b.scope || ''),
        text = String(b.body || '').trim();
      if (!validScope(scope) || text.length < 1 || text.length > 2000)
        throw new ApiError('Комментарий должен содержать 1–2000 символов');
      const wall = scope.startsWith('wall:') ? scope.slice(5) : null;
      let recipient = wall;
      if (wall) {
        const owner = await db()
          .prepare('SELECT wall_open FROM users WHERE id=?')
          .bind(wall)
          .first<{ wall_open: number }>();
        if (!owner) throw new ApiError('Профиль не найден', 404);
        if (!owner.wall_open && wall !== u.id)
          throw new ApiError('Стенка закрыта', 403);
        if (await blocked(u.id, wall))
          throw new ApiError('Общение с этим пользователем ограничено', 403);
      }
      if (b.parent_id) {
        const parent = await db()
          .prepare(
            'SELECT scope,author_id FROM comments WHERE id=? AND deleted=0',
          )
          .bind(b.parent_id)
          .first<{ scope: string; author_id: string }>();
        if (!parent || parent.scope !== scope)
          throw new ApiError('Ответ относится к другому обсуждению');
        if (await blocked(u.id, parent.author_id))
          throw new ApiError('Общение ограничено', 403);
        recipient = parent.author_id;
      }
      const recent = await db()
        .prepare(
          'SELECT created_at,body FROM comments WHERE author_id=? ORDER BY created_at DESC LIMIT 1',
        )
        .bind(u.id)
        .first<{ created_at: number; body: string }>();
      if (
        recent &&
        (now() - recent.created_at < 10000 ||
          (recent.body === text && now() - recent.created_at < 60000))
      )
        throw new ApiError(
          'Подождите немного перед следующим комментарием',
          429,
        );
      const id = uid();
      const statements = [
        db()
          .prepare(
            'INSERT INTO comments (id,scope,author_id,parent_id,body,spoiler,created_at) VALUES (?,?,?,?,?,?,?)',
          )
          .bind(
            id,
            scope,
            u.id,
            b.parent_id || null,
            text,
            b.spoiler ? 1 : 0,
            now(),
          ),
      ];
      if (recipient && recipient !== u.id)
        statements.push(
          db()
            .prepare(
              'INSERT INTO notifications (id,user_id,actor_id,scope,comment_id,created_at) VALUES (?,?,?,?,?,?)',
            )
            .bind(uid(), recipient, u.id, scope, id, now()),
        );
      await db().batch(statements);
      return json({ ok: true, id });
    }
    if (['edit', 'delete', 'pin', 'like', 'report'].includes(action)) {
      const c = await db()
        .prepare('SELECT * FROM comments WHERE id=?')
        .bind(String(b.id || ''))
        .first<{
          id: string;
          scope: string;
          author_id: string;
          deleted: number;
        }>();
      if (!c) throw new ApiError('Комментарий не найден', 404);
      if (await blocked(u.id, c.author_id))
        throw new ApiError('Общение ограничено', 403);
      if (action === 'delete') {
        if (c.author_id !== u.id && c.scope !== 'wall:' + u.id)
          throw new ApiError('Нельзя удалить чужой комментарий', 403);
        await db()
          .prepare('UPDATE comments SET body=?,deleted=1,pinned=0 WHERE id=?')
          .bind('', c.id)
          .run();
      }
      if (action === 'edit') {
        if (c.author_id !== u.id || c.deleted)
          throw new ApiError('Нельзя изменить комментарий', 403);
        const text = String(b.body || '').trim();
        if (!text || text.length > 2000)
          throw new ApiError('Допустимо 1–2000 символов');
        await db()
          .prepare('UPDATE comments SET body=?,edited_at=? WHERE id=?')
          .bind(text, now(), c.id)
          .run();
      }
      if (action === 'pin') {
        if (c.scope !== 'wall:' + u.id || c.deleted)
          throw new ApiError('Закрепление доступно владельцу стенки', 403);
        await db().batch([
          db()
            .prepare('UPDATE comments SET pinned=0 WHERE scope=?')
            .bind(c.scope),
          db()
            .prepare('UPDATE comments SET pinned=? WHERE id=?')
            .bind(b.value ? 1 : 0, c.id),
        ]);
      }
      if (action === 'like') {
        const value = b.vote === undefined ? (b.value ? 1 : 0) : Number(b.vote);
        if (![0, 1, -1].includes(value))
          throw new ApiError('Некорректный голос');
        if (value)
          await db()
            .prepare(
              'INSERT INTO likes(user_id,comment_id,value) VALUES (?,?,?) ON CONFLICT(user_id,comment_id) DO UPDATE SET value=excluded.value',
            )
            .bind(u.id, c.id, value)
            .run();
        else
          await db()
            .prepare('DELETE FROM likes WHERE user_id=? AND comment_id=?')
            .bind(u.id, c.id)
            .run();
      }
      if (action === 'report') {
        const reason = String(b.reason || 'Спам или нарушение правил').slice(
          0,
          300,
        );
        await db()
          .prepare(
            'INSERT OR IGNORE INTO reports (id,user_id,comment_id,reason,created_at) VALUES (?,?,?,?,?)',
          )
          .bind(uid(), u.id, c.id, reason, now())
          .run();
      }
      return json({ ok: true });
    }
    if (action === 'block') {
      const target = String(b.id || '');
      if (
        target === u.id ||
        !(await db()
          .prepare('SELECT id FROM users WHERE id=?')
          .bind(target)
          .first())
      )
        throw new ApiError('Пользователь не найден');
      await db()
        .prepare(
          b.value
            ? 'INSERT OR IGNORE INTO blocks (user_id,target_id) VALUES (?,?)'
            : 'DELETE FROM blocks WHERE user_id=? AND target_id=?',
        )
        .bind(u.id, target)
        .run();
      return json({ ok: true });
    }
    if (action === 'seen') {
      await db()
        .prepare('UPDATE notifications SET seen=1 WHERE user_id=?')
        .bind(u.id)
        .run();
      return json({ ok: true });
    }
    if (action === 'moderate') {
      if (!isModerator(u)) throw new ApiError('Недостаточно прав', 403);
      const report = await db()
        .prepare('SELECT comment_id FROM reports WHERE id=?')
        .bind(String(b.id))
        .first<{ comment_id: string }>();
      if (!report) throw new ApiError('Жалоба не найдена', 404);
      const statements = [
        db().prepare('UPDATE reports SET resolved=1 WHERE id=?').bind(b.id),
      ];
      if (b.remove)
        statements.push(
          db()
            .prepare('UPDATE comments SET body=?,deleted=1,pinned=0 WHERE id=?')
            .bind('', report.comment_id),
        );
      await db().batch(statements);
      return json({ ok: true });
    }
    if (action === 'logout') {
      const { cookie, hash } = await import('@/lib/server/core');
      await db()
        .prepare('DELETE FROM sessions WHERE hash=?')
        .bind(await hash(cookie(r, 'am_session')))
        .run();
      return new Response(null, {
        status: 204,
        headers: {
          'Set-Cookie':
            'am_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0',
        },
      });
    }
    throw new ApiError('Неизвестное действие', 404);
  } catch (e) {
    return fail(e);
  }
}
