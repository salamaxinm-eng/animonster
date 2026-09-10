import { db, viewer, json, fail, ApiError } from '@/lib/server/core';
export async function GET(r: Request) {
  try {
    const u = await viewer(r),
      id = new URL(r.url).searchParams.get('id') || u?.id;
    if (!id) throw new ApiError('Войдите в аккаунт', 401);
    const owner = await db()
      .prepare('SELECT collection_public FROM users WHERE id=?')
      .bind(id)
      .first<{ collection_public: number }>();
    if (!owner) throw new ApiError('Профиль не найден', 404);
    const aggregate = await db()
      .prepare(
        'SELECT COALESCE(sum(completed),0) AS xp,COALESCE(sum(watched_seconds),0) AS seconds,count(DISTINCT CASE WHEN completed=1 THEN anime_id END) AS titles FROM history WHERE user_id=?',
      )
      .bind(id)
      .first<{ xp: number; seconds: number; titles: number }>();
    const favorite = await db()
      .prepare(
        'SELECT count(*) AS n FROM collection WHERE user_id=? AND favorite=1',
      )
      .bind(id)
      .first<{ n: number }>();
    const xp = aggregate?.xp || 0,
      seconds = aggregate?.seconds || 0,
      favorites = favorite?.n || 0,
      titles = aggregate?.titles || 0;
    const achievements = [
      ...[1, 5, 10, 25, 50, 100, 250, 500].map((n) => ({
        id: 'episodes-' + n,
        title: n + ' серий',
        current: xp,
        target: n,
      })),
      ...[1, 5, 10, 25, 50, 100].map((n) => ({
        id: 'hours-' + n,
        title: n + ' часов аниме',
        current: Math.floor(seconds / 60),
        target: n * 60,
      })),
      ...[1, 3, 5].map((n) => ({
        id: 'favorites-' + n,
        title: n + ' в избранном',
        current: favorites,
        target: n,
      })),
      ...[1, 5, 10].map((n) => ({
        id: 'titles-' + n,
        title: 'Серии из ' + n + ' тайтлов',
        current: titles,
        target: n,
      })),
    ].map((a) => ({ ...a, unlocked: a.current >= a.target }));
    const visible = !!owner.collection_public || u?.id === id;
    const history = visible
      ? (
          await db()
            .prepare(
              'SELECT h.*,a.data,(SELECT count(*) FROM history h2 WHERE h2.user_id=h.user_id AND h2.anime_id=h.anime_id AND h2.completed=1) AS completed_episodes FROM history h LEFT JOIN anime_cache a ON a.id=h.anime_id WHERE h.user_id=? AND h.episode=(SELECT h3.episode FROM history h3 WHERE h3.user_id=h.user_id AND h3.anime_id=h.anime_id ORDER BY h3.updated_at DESC,h3.episode DESC LIMIT 1) ORDER BY h.updated_at DESC LIMIT 300',
            )
            .bind(id)
            .all()
        ).results.map((x) => ({
          ...x,
          anime: x.data ? JSON.parse(String(x.data)) : null,
          data: undefined,
        }))
      : [];
    return json({
      xp,
      level: 1 + Math.floor(xp / 10),
      nextLevelAt: (Math.floor(xp / 10) + 1) * 10,
      seconds,
      favorites,
      achievements,
      history,
      visible,
    });
  } catch (e) {
    return fail(e);
  }
}
