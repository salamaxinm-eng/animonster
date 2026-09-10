import { db, now } from './core';
export async function dashboard() {
  const day = new Date(now()).toISOString().slice(0, 10),
    month = new Date(now() - 29 * 86400000).toISOString().slice(0, 10);
  const [dau, mau, views, users, daily] = await Promise.all([
    db()
      .prepare('SELECT count(*) AS n FROM daily_activity WHERE day=?')
      .bind(day)
      .first<{ n: number }>(),
    db()
      .prepare(
        'SELECT count(DISTINCT actor) AS n FROM daily_activity WHERE day>=?',
      )
      .bind(month)
      .first<{ n: number }>(),
    db()
      .prepare('SELECT count(*) AS n FROM daily_views')
      .first<{ n: number }>(),
    db()
      .prepare('SELECT count(*) AS n FROM users WHERE identity NOT LIKE ?')
      .bind('preview:%')
      .first<{ n: number }>(),
    db()
      .prepare(
        'SELECT day,count(*) AS n FROM daily_views WHERE day>=? GROUP BY day ORDER BY day DESC',
      )
      .bind(month)
      .all(),
  ]);
  return {
    dau: dau?.n || 0,
    mau: mau?.n || 0,
    views: views?.n || 0,
    users: users?.n || 0,
    daily: daily.results,
  };
}
