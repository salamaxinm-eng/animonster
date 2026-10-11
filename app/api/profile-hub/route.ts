import {
  ApiError,
  db,
  fail,
  json,
  requireUser,
  sameOrigin,
} from '@/lib/server/core';
import { saveProfileAppearance } from '@/lib/server/profile-appearance';
import { evaluateUserAchievements } from '@/lib/server/achievements';
import { cosmeticsCatalog } from '@/lib/server/cosmetics';

function animeMetadata(raw: unknown) {
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw || {};
  } catch {
    return {};
  }
}
function historyItem(row: any) {
  const anime = animeMetadata(row.data);
  return {
    anime_id: Number(row.anime_id),
    episode: Number(row.episode),
    position: Number(row.position),
    duration: Number(row.duration),
    completed: Number(row.completed),
    updated_at: Number(row.updated_at),
    voiceover: row.voiceover,
    title: anime.russian || anime.name || row.title || `Аниме #${row.anime_id}`,
    image: anime.image?.original || row.image || null,
    total_episodes: Number(anime.episodes) > 0 ? Number(anime.episodes) : null,
    completed_episodes: Number(row.completed_episodes || 0),
  };
}
const historyColumns = `h.anime_id,h.episode,h.position,h.duration,h.completed,h.updated_at,h.voiceover,c.title,c.image,a.data`;
const historyJoins = `LEFT JOIN collection c ON c.user_id=h.user_id AND c.anime_id=h.anime_id LEFT JOIN anime_cache a ON a.id=h.anime_id`;

// Every query is scoped to the authenticated owner. A supplied member id is ignored.
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const params = new URL(request.url).searchParams;
    const page = Math.floor(
      Math.max(0, Math.min(10000, Number(params.get('page')) || 0)),
    );
    const kind = params.get('kind') || 'history';
    if (kind === 'inventory') {
      await evaluateUserAchievements(user.id);
      return json({ cosmetics: await cosmeticsCatalog(user.id) });
    }
    if (kind === 'account') {
      const account = await db()
        .prepare(
          'SELECT email,(password_hash IS NOT NULL) AS has_password FROM users WHERE id=?',
        )
        .bind(user.id)
        .first();
      return json(account);
    }
    if (kind === 'overview') {
      const [summary, favorites, recent] = await Promise.all([
        db()
          .prepare(`SELECT (SELECT count(*) FROM collection WHERE user_id=?) AS anime_count,
          coalesce(sum(completed),0) AS completed_episodes,coalesce(sum(watched_seconds),0) AS watched_seconds
          FROM history WHERE user_id=?`)
          .bind(user.id, user.id)
          .first(),
        db()
          .prepare(
            'SELECT anime_id,title,image,status FROM collection WHERE user_id=? AND favorite=1 ORDER BY title LIMIT 5',
          )
          .bind(user.id)
          .all(),
        db()
          .prepare(`SELECT ${historyColumns} FROM history h ${historyJoins}
          WHERE h.user_id=? AND h.episode=(SELECT h2.episode FROM history h2 WHERE h2.user_id=h.user_id AND h2.anime_id=h.anime_id ORDER BY h2.updated_at DESC,h2.episode DESC LIMIT 1)
          ORDER BY h.updated_at DESC,h.anime_id LIMIT 4`)
          .bind(user.id)
          .all(),
      ]);
      return json({
        summary,
        favorites: favorites.results,
        continue: recent.results.map(historyItem),
      });
    }
    if (kind === 'list') {
      const status = params.get('status') || 'all';
      const query = String(params.get('q') || '')
        .trim()
        .slice(0, 80)
        .toLocaleLowerCase('ru');
      const order =
        params.get('sort') === 'rating'
          ? 'c.rating DESC,c.title,c.anime_id'
          : params.get('sort') === 'progress'
            ? 'completed_episodes DESC,c.title,c.anime_id'
            : 'c.title,c.anime_id';
      const clause = status.startsWith('list:')
        ? 'AND EXISTS(SELECT 1 FROM collection_list_items i JOIN collection_lists l ON l.id=i.list_id WHERE l.user_id=c.user_id AND l.id=? AND i.anime_id=c.anime_id)'
        : status === 'all'
          ? ''
          : 'AND c.status=?';
      const args = [
        user.id,
        ...(clause
          ? [status.startsWith('list:') ? status.slice(5) : status]
          : []),
        `%${query}%`,
        page * 40,
      ];
      const [rows, counts] = await Promise.all([
        db()
          .prepare(`SELECT c.anime_id,c.title,c.image,c.status,c.rating,c.favorite,a.data,
          coalesce((SELECT json_agg(i.list_id) FROM collection_list_items i JOIN collection_lists l ON l.id=i.list_id WHERE l.user_id=c.user_id AND i.anime_id=c.anime_id),'[]'::json) AS list_ids,
          (SELECT count(*) FROM history hc WHERE hc.user_id=c.user_id AND hc.anime_id=c.anime_id AND hc.completed=1) AS completed_episodes,
          h.episode,h.position,h.duration,h.completed,h.updated_at,h.voiceover
          FROM collection c LEFT JOIN anime_cache a ON a.id=c.anime_id
          LEFT JOIN LATERAL (SELECT * FROM history h1 WHERE h1.user_id=c.user_id AND h1.anime_id=c.anime_id ORDER BY h1.updated_at DESC,h1.episode DESC LIMIT 1) h ON true
          WHERE c.user_id=? ${clause} AND lower(c.title) LIKE ? ORDER BY ${order} LIMIT 41 OFFSET ?`)
          .bind(...args)
          .all(),
        db()
          .prepare(
            'SELECT status,count(*) AS count FROM collection WHERE user_id=? GROUP BY status',
          )
          .bind(user.id)
          .all(),
      ]);
      return json({
        items: rows.results.slice(0, 40).map((row: any) => {
          const anime = animeMetadata(row.data);
          return {
            anime_id: row.anime_id,
            title: row.title,
            image: row.image,
            status: row.status,
            rating: row.rating,
            favorite: row.favorite,
            list_ids: row.list_ids || [],
            completed_episodes: Number(row.completed_episodes),
            total_episodes:
              Number(anime.episodes) > 0 ? Number(anime.episodes) : null,
            latest: row.episode ? historyItem(row) : null,
          };
        }),
        counts: counts.results,
        hasMore: rows.results.length > 40,
      });
    }
    if (kind === 'payments') {
      const rows = await db()
        .prepare(
          "SELECT id,plan,amount,status,created_at FROM orders WHERE user_id=? AND (plan IS NULL OR plan NOT IN ('vpn','vpn_plus','battlepass')) ORDER BY created_at DESC,id LIMIT 31 OFFSET ?",
        )
        .bind(user.id, page * 30)
        .all();
      return json({
        items: rows.results.slice(0, 30),
        hasMore: rows.results.length > 30,
      });
    }
    if (kind === 'activity') {
      const filter = ['watch', 'achievement', 'cosmetic'].includes(
        params.get('type') || '',
      )
        ? params.get('type')
        : 'all';
      const rows = await db()
        .prepare(`SELECT * FROM (
        SELECT 'achievement:'||a.id AS id,'achievement' AS kind,a.name AS title,ua.unlocked_at AS date,NULL::integer AS anime_id,NULL::integer AS episode
        FROM user_achievements ua JOIN achievements a ON a.id=ua.achievement_id WHERE ua.user_id=?
        UNION ALL
        SELECT 'cosmetic:'||c.id,'cosmetic',c.name,uc.unlocked_at,NULL::integer,NULL::integer
        FROM user_cosmetics uc JOIN cosmetics c ON c.id=uc.cosmetic_id WHERE uc.user_id=? AND uc.source<>'free'
        UNION ALL
        SELECT 'watch:'||h.anime_id||':'||h.episode,'watch',coalesce(a.data::jsonb->>'russian',a.data::jsonb->>'name',col.title,'Аниме #'||h.anime_id),h.updated_at,h.anime_id,h.episode
        FROM history h LEFT JOIN collection col ON col.user_id=h.user_id AND col.anime_id=h.anime_id LEFT JOIN anime_cache a ON a.id=h.anime_id WHERE h.user_id=?
      ) events WHERE (?='all' OR kind=?) ORDER BY date DESC,id LIMIT 41 OFFSET ?`)
        .bind(user.id, user.id, user.id, filter, filter, page * 40)
        .all();
      return json({
        items: rows.results.slice(0, 40),
        hasMore: rows.results.length > 40,
      });
    }
    if (kind !== 'history') throw new ApiError('Раздел не найден', 404);
    const query = String(params.get('q') || '')
      .trim()
      .slice(0, 80)
      .toLocaleLowerCase('ru');
    const days = Number(params.get('days'));
    const since = [7, 30].includes(days) ? Date.now() - days * 86400000 : 0;
    const rows = await db()
      .prepare(`SELECT ${historyColumns} FROM history h ${historyJoins}
      WHERE h.user_id=? AND h.updated_at>=? AND lower(coalesce(a.data::jsonb->>'russian',a.data::jsonb->>'name',c.title,'')) LIKE ?
      ORDER BY h.updated_at DESC,h.anime_id,h.episode LIMIT 41 OFFSET ?`)
      .bind(user.id, since, `%${query}%`, page * 40)
      .all();
    return json({
      items: rows.results.slice(0, 40).map(historyItem),
      hasMore: rows.results.length > 40,
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await requireUser(request);
    const form = await request.formData();
    await saveProfileAppearance(user, form);
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
