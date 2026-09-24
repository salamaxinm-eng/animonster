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
  inviteRequired,
  emailVerificationEnabled,
  type User,
} from '@/lib/server/core';
import { themes, avatars } from '@/lib/community';
import { markRecommendationsDirty } from '@/lib/server/recommendations/repository';
import { plusEntitlements, reactions } from '@/lib/server/plus';
import { safeRemoteImageUrl } from '@/lib/server/images';
import { validateEquippedCosmetic } from '@/lib/server/cosmetics';
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
          !!runtime().PLATEGA_MERCHANT_ID &&
          !!runtime().PLATEGA_SECRET_KEY,
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
                  'SELECT l.id,l.name,l.description,l.cover,l.pinned,count(i.anime_id) AS item_count FROM collection_lists l LEFT JOIN collection_list_items i ON i.list_id=l.id WHERE l.user_id=? GROUP BY l.id,l.name,l.description,l.cover,l.pinned,l.created_at ORDER BY l.pinned DESC,l.created_at,l.name',
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
      const publicProfile = await publicUser(profile);
      const [animeShowcase, characterShowcase, characters] = await Promise.all([
        db()
          .prepare(
            'SELECT s.anime_id,a.data FROM profile_anime_showcase s LEFT JOIN anime_cache a ON a.id=s.anime_id WHERE s.user_id=? ORDER BY s.position LIMIT 5',
          )
          .bind(id)
          .all(),
        db()
          .prepare(
            'SELECT c.id,c.name,c.image,c.anime_id FROM profile_character_showcase s JOIN characters c ON c.id=s.character_id WHERE s.user_id=? AND c.active=1 ORDER BY s.position LIMIT 5',
          )
          .bind(id)
          .all(),
        own
          ? db()
              .prepare(
                'SELECT id,name,image,anime_id FROM characters WHERE active=1 ORDER BY name LIMIT 200',
              )
              .all()
          : Promise.resolve({ results: [] }),
      ]);
      return json({
        user: publicProfile,
        entries: entries.map((entry: any) => ({
          ...entry,
          list_ids: memberships
            .filter((item) => item.anime_id === entry.anime_id)
            .map((item) => item.list_id),
        })),
        lists: publicProfile.premium_until
          ? lists
          : lists.map((list: any) => ({
              ...list,
              description: '',
              cover: null,
              pinned: 0,
            })),
        anime_showcase: publicProfile.premium_until
          ? animeShowcase.results.map((row: any) => ({
              anime_id: row.anime_id,
              anime: row.data ? JSON.parse(String(row.data)) : null,
            }))
          : [],
        character_showcase: publicProfile.premium_until
          ? characterShowcase.results
          : [],
        characters: characters.results,
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
      const [rows, reactionRows] = await Promise.all([
        db()
          .prepare(
            `SELECT c.*,u.nick,u.avatar,u.theme,
             EXISTS(SELECT 1 FROM grants g WHERE g.user_id=u.id AND g.revoked_at IS NULL AND g.expires>?) AS plus,
             CASE WHEN EXISTS(SELECT 1 FROM cosmetics x WHERE x.slug=u.pin AND x.kind='pin' AND x.active=1 AND
               (x.access_type='free' OR (x.access_type='plus' AND EXISTS(SELECT 1 FROM grants g WHERE g.user_id=u.id AND g.revoked_at IS NULL AND g.expires>?)) OR
               (x.access_type NOT IN ('free','plus') AND EXISTS(SELECT 1 FROM user_cosmetics uc WHERE uc.user_id=u.id AND uc.cosmetic_id=x.id)))) THEN u.pin ELSE NULL END AS pin,
             CASE WHEN EXISTS(SELECT 1 FROM cosmetics x WHERE x.slug=u.tag AND x.kind='tag' AND x.active=1 AND
               (x.access_type='free' OR (x.access_type='plus' AND EXISTS(SELECT 1 FROM grants g WHERE g.user_id=u.id AND g.revoked_at IS NULL AND g.expires>?)) OR
               (x.access_type NOT IN ('free','plus') AND EXISTS(SELECT 1 FROM user_cosmetics uc WHERE uc.user_id=u.id AND uc.cosmetic_id=x.id)))) THEN u.tag ELSE NULL END AS tag,
             CASE WHEN u.profile_frame='none' THEN 'none'
               WHEN EXISTS(SELECT 1 FROM cosmetics x WHERE x.slug=u.profile_frame AND x.kind='frame' AND x.active=1 AND
                 (x.access_type='free' OR (x.access_type='plus' AND EXISTS(SELECT 1 FROM grants g WHERE g.user_id=u.id AND g.revoked_at IS NULL AND g.expires>?)) OR
                 (x.access_type NOT IN ('free','plus') AND EXISTS(SELECT 1 FROM user_cosmetics uc WHERE uc.user_id=u.id AND uc.cosmetic_id=x.id)))) THEN u.profile_frame
               ELSE 'none' END AS profile_frame,
             (SELECT count(*) FROM likes l WHERE l.comment_id=c.id AND l.value=1) AS like_count,
             (SELECT count(*) FROM likes l WHERE l.comment_id=c.id AND l.value=-1) AS dislike_count,
             COALESCE((SELECT sum(value) FROM likes l WHERE l.comment_id=c.id),0) AS score,
             COALESCE((SELECT value FROM likes l WHERE l.comment_id=c.id AND l.user_id=?),0) AS vote
             FROM comments c JOIN users u ON u.id=c.author_id WHERE c.scope=? AND
             NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.user_id=? AND b.target_id=c.author_id) OR (b.user_id=c.author_id AND b.target_id=?))
             ORDER BY c.pinned DESC,${order} LIMIT 100`,
          )
          .bind(
            now(),
            now(),
            now(),
            now(),
            u?.id || '',
            scope,
            u?.id || '',
            u?.id || '',
          )
          .all(),
        db()
          .prepare(
            'SELECT comment_id,user_id,reaction,count(*) AS n FROM comment_reactions WHERE comment_id IN (SELECT id FROM comments WHERE scope=?) GROUP BY comment_id,user_id,reaction',
          )
          .bind(scope)
          .all(),
      ]);
      return json(
        rows.results.map((c: any) => {
          const related = reactionRows.results.filter(
            (x: any) => x.comment_id === c.id,
          );
          const reaction_counts = Object.fromEntries(
            reactions.map((reaction) => [
              reaction,
              related
                .filter((x: any) => x.reaction === reaction)
                .reduce((sum: number, x: any) => sum + Number(x.n), 0),
            ]),
          );
          const my_reactions = related
            .filter((x: any) => x.user_id === u?.id)
            .map((x: any) => x.reaction);
          return c.deleted
            ? {
                ...c,
                body: 'Комментарий удалён',
                pin: null,
                tag: null,
                reaction_counts,
                my_reactions,
              }
            : { ...c, plus: !!c.plus, reaction_counts, my_reactions };
        }),
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
      const access = await plusEntitlements(u.id);
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
      if (avatar !== u.avatar && !access.canChangeAvatar)
        throw new ApiError(
          'Смена аватара откроется на 5 уровне или с AniMonster Plus.',
          403,
        );
      const selectedTheme = themes.find((x) => x.id === b.theme);
      if (
        !selectedTheme ||
        (!avatars.some((x) => x.id === avatar) && !customAvatar)
      )
        throw new ApiError('Неизвестное оформление');
      const [pin, frame, tag] = await Promise.all([
        validateEquippedCosmetic(u.id, 'pin', b.pin, access.premiumUntil),
        validateEquippedCosmetic(
          u.id,
          'frame',
          b.profile_frame,
          access.premiumUntil,
        ),
        validateEquippedCosmetic(u.id, 'tag', b.tag, access.premiumUntil),
      ]);
      if (selectedTheme.cosmetic)
        await validateEquippedCosmetic(
          u.id,
          'theme',
          selectedTheme.cosmetic,
          access.premiumUntil,
        );
      const autoSkipSegments =
        b.auto_skip_segments == null
          ? (u.auto_skip_segments ?? null)
          : b.auto_skip_segments
            ? 1
            : 0;
      await db()
        .prepare(
          'UPDATE users SET nick=?,bio=?,theme=?,avatar=?,pin=?,profile_frame=?,tag=?,wall_open=?,collection_public=?,auto_skip_segments=? WHERE id=?',
        )
        .bind(
          nick,
          bio,
          selectedTheme.id,
          avatar,
          pin,
          frame,
          tag,
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
        await markRecommendationsDirty(u.id);
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
      await markRecommendationsDirty(u.id);
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

        await markRecommendationsDirty(u.id);

        return json({ ok: true });
      }

      if (!['planned', 'watching', 'completed', 'dropped'].includes(b.status))
        throw new ApiError('Неизвестный статус');

      const rating = Number(b.rating || 0);

      if (!Number.isInteger(rating) || rating < 0 || rating > 10)
        throw new ApiError('Оценка от 1 до 10');

      /*
       * Не доверяем title/image, которые прислал браузер.
       * Берём канонические данные тайтла из нашего каталога.
       */
      const item = await getAnime(id);

      if (!item) throw new ApiError('Аниме не найдено', 404);

      const title = String(item.anime.russian || item.anime.name || '')
        .trim()
        .slice(0, 200);

      if (!title) throw new ApiError('Некорректное название тайтла');

      /*
       * Постеры могут приходить:
       *
       * /system/...
       * //desu.shikimori.one/...
       * https://shikimori.io/...
       * https://api.anilibria.app/...
       * и с других разрешённых источников.
       */
      let image = String(item.anime.image?.original || '').trim();

      if (image.startsWith('//')) {
        image = 'https:' + image;
      } else if (image.startsWith('/')) {
        image = 'https://shikimori.one' + image;
      }

      try {
        image = safeRemoteImageUrl(image).href;
      } catch {
        throw new ApiError('Некорректная обложка тайтла');
      }

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

      await markRecommendationsDirty(u.id);

      return json({ ok: true });
    }
    if (action === 'list_create') {
      const name = String(b.name || '')
        .trim()
        .replace(/\s+/g, ' ');
      if (name.length < 2 || name.length > 30)
        throw new ApiError('Название списка: от 2 до 30 символов');
      const access = await plusEntitlements(u.id);
      const exists = await db()
        .prepare(
          'SELECT 1 FROM collection_lists WHERE user_id=? AND lower(name)=lower(?)',
        )
        .bind(u.id, name)
        .first();
      if (exists)
        throw new ApiError('Список с таким названием уже существует', 409);
      const id = uid();
      const created = await db()
        .prepare(
          `INSERT INTO collection_lists(id,user_id,name,created_at,slot)
           SELECT ?,?,?,?,candidate.slot FROM generate_series(1,?) AS candidate(slot)
           WHERE (SELECT count(*) FROM collection_lists existing WHERE existing.user_id=?)<?
           AND NOT EXISTS(SELECT 1 FROM collection_lists l WHERE l.user_id=? AND l.slot=candidate.slot)
           ORDER BY candidate.slot LIMIT 1 ON CONFLICT DO NOTHING RETURNING id`,
        )
        .bind(
          id,
          u.id,
          name,
          now(),
          access.customListLimit,
          u.id,
          access.customListLimit,
          u.id,
        )
        .first();
      if (!created)
        throw new ApiError(
          `Доступно не больше ${access.customListLimit} своих списков.`,
          403,
          'list_limit_reached',
        );
      return json({ id, name, item_count: 0 });
    }
    if (action === 'list_update') {
      const access = await plusEntitlements(u.id);
      if (!access.canCustomizeLists)
        throw new ApiError(
          'Оформление списков доступно с AniMonster Plus',
          403,
        );
      const id = String(b.id || ''),
        description = String(b.description || '')
          .trim()
          .slice(0, 300),
        pinned = b.pinned ? 1 : 0;
      if (pinned) {
        const count = await db()
          .prepare(
            'SELECT count(*) AS n FROM collection_lists WHERE user_id=? AND pinned=1 AND id<>?',
          )
          .bind(u.id, id)
          .first<{ n: number }>();
        if (Number(count?.n || 0) >= 3)
          throw new ApiError('Можно закрепить не больше трёх списков');
      }
      await db()
        .prepare(
          'UPDATE collection_lists SET description=?,pinned=? WHERE id=? AND user_id=?',
        )
        .bind(description, pinned, id, u.id)
        .run();
      return json({ ok: true });
    }
    if (action === 'showcase') {
      const access = await plusEntitlements(u.id);
      if (!access.canCustomizeProfile)
        throw new ApiError('Витрина доступна с AniMonster Plus', 403);
      const animeIds: number[] = Array.isArray(b.anime_ids)
        ? Array.from(
            new Set<number>(
              b.anime_ids
                .map(Number)
                .filter((id: number) => Number.isInteger(id) && id > 0),
            ),
          ).slice(0, 5)
        : [];
      const characterIds: string[] = Array.isArray(b.character_ids)
        ? Array.from(new Set<string>(b.character_ids.map(String))).slice(0, 5)
        : [];
      await db().batch([
        db()
          .prepare('DELETE FROM profile_anime_showcase WHERE user_id=?')
          .bind(u.id),
        ...animeIds.map((id: number, position: number) =>
          db()
            .prepare(
              'INSERT INTO profile_anime_showcase(user_id,anime_id,position) VALUES (?,?,?)',
            )
            .bind(u.id, id, position),
        ),
        db()
          .prepare('DELETE FROM profile_character_showcase WHERE user_id=?')
          .bind(u.id),
        ...characterIds.map((id: string, position: number) =>
          db()
            .prepare(
              'INSERT INTO profile_character_showcase(user_id,character_id,position) SELECT ?,id,? FROM characters WHERE id=? AND active=1',
            )
            .bind(u.id, position, id),
        ),
      ]);
      return json({ ok: true });
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
    if (action === 'reaction') {
      const id = String(b.id || ''),
        reaction = String(b.reaction || '');
      if (!reactions.includes(reaction))
        throw new ApiError('Неизвестная реакция');
      const comment = await db()
        .prepare('SELECT 1 FROM comments WHERE id=? AND deleted=0')
        .bind(id)
        .first();
      if (!comment) throw new ApiError('Комментарий не найден', 404);
      const existing = await db()
        .prepare(
          'SELECT 1 FROM comment_reactions WHERE comment_id=? AND user_id=? AND reaction=?',
        )
        .bind(id, u.id, reaction)
        .first();
      if (existing) {
        await db()
          .prepare(
            'DELETE FROM comment_reactions WHERE comment_id=? AND user_id=? AND reaction=?',
          )
          .bind(id, u.id, reaction)
          .run();
        return json({ ok: true, active: false });
      }
      const access = await plusEntitlements(u.id);
      if (!access.canReact)
        throw new ApiError('Фирменные реакции доступны с AniMonster Plus', 403);
      await db()
        .prepare(
          'INSERT INTO comment_reactions(comment_id,user_id,reaction,created_at) VALUES (?,?,?,?)',
        )
        .bind(id, u.id, reaction, now())
        .run();
      return json({ ok: true, active: true });
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
