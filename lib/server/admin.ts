import { db, now } from './core';
export async function dashboard() {
  const timestamp = now(),
    day = new Date(timestamp).toISOString().slice(0, 10),
    week = new Date(timestamp - 6 * 86400000).toISOString().slice(0, 10),
    month = new Date(timestamp - 29 * 86400000).toISOString().slice(0, 10),
    monthStart = timestamp - 29 * 86400000,
    activeSince = timestamp - 15 * 60 * 1000;
  const [
    dau,
    mau,
    views,
    users,
    daily,
    signups7d,
    signups30d,
    views7d,
    views30d,
    recentLogins,
    premiumUsers,
    watchStats,
    favorites,
    comments30d,
    openReports,
    catalogTitles,
    recommendationStats,
    dailyActivity,
    topAnime,
    topUsers,
    providers,
    paymentStats,
  ] = await Promise.all([
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
      .prepare(
        'SELECT count(*) AS n FROM users WHERE identity NOT LIKE ? AND deleted_at IS NULL',
      )
      .bind('preview:%')
      .first<{ n: number }>(),
    db()
      .prepare(
        'SELECT day,count(*) AS n FROM daily_views WHERE day>=? GROUP BY day ORDER BY day DESC',
      )
      .bind(month)
      .all(),
    db()
      .prepare(
        "SELECT count(*) AS n FROM users WHERE deleted_at IS NULL AND identity NOT LIKE 'preview:%' AND created_at>=?",
      )
      .bind(timestamp - 6 * 86400000)
      .first<{ n: number }>(),
    db()
      .prepare(
        "SELECT count(*) AS n FROM users WHERE deleted_at IS NULL AND identity NOT LIKE 'preview:%' AND created_at>=?",
      )
      .bind(monthStart)
      .first<{ n: number }>(),
    db()
      .prepare('SELECT count(*) AS n FROM daily_views WHERE day>=?')
      .bind(week)
      .first<{ n: number }>(),
    db()
      .prepare('SELECT count(*) AS n FROM daily_views WHERE day>=?')
      .bind(month)
      .first<{ n: number }>(),
    db()
      .prepare(
        'SELECT count(*) AS n FROM sessions WHERE expires>? AND created_at>=?',
      )
      .bind(timestamp, activeSince)
      .first<{ n: number }>(),
    db()
      .prepare(
        'SELECT count(DISTINCT user_id) AS n FROM grants WHERE revoked_at IS NULL AND starts_at<=? AND expires>?',
      )
      .bind(timestamp, timestamp)
      .first<{ n: number }>(),
    db()
      .prepare(
        'SELECT COALESCE(sum(watched_seconds),0) AS seconds, count(*) AS tracked, COALESCE(sum(completed),0) AS completed FROM history',
      )
      .first<{ seconds: number; tracked: number; completed: number }>(),
    db()
      .prepare('SELECT count(*) AS n FROM collection WHERE favorite=1')
      .first<{ n: number }>(),
    db()
      .prepare(
        'SELECT count(*) AS n FROM comments WHERE deleted=0 AND created_at>=?',
      )
      .bind(monthStart)
      .first<{ n: number }>(),
    db()
      .prepare('SELECT count(*) AS n FROM reports WHERE resolved=0')
      .first<{ n: number }>(),
    db()
      .prepare('SELECT count(*) AS n FROM anime_cache')
      .first<{ n: number }>(),
    db()
      .prepare(
        'SELECT count(*) AS recommendations, count(DISTINCT user_id) AS users FROM user_recommendations',
      )
      .first<{ recommendations: number; users: number }>(),
    db()
      .prepare(
        'SELECT day,count(*) AS n FROM daily_activity WHERE day>=? GROUP BY day ORDER BY day DESC',
      )
      .bind(month)
      .all(),
    db()
      .prepare(`SELECT v.anime_id,count(*) AS views,a.data FROM daily_views v
        LEFT JOIN anime_cache a ON a.id=v.anime_id
        WHERE v.day>=? GROUP BY v.anime_id,a.data ORDER BY views DESC LIMIT 10`)
      .bind(month)
      .all(),
    db()
      .prepare(`SELECT u.id,u.nick,
        COALESCE(SUM(CASE WHEN h.completed=1 THEN 1 ELSE 0 END),0) AS watched_episodes,
        COUNT(h.episode) AS tracked_episodes
        FROM users u LEFT JOIN history h ON h.user_id=u.id
        WHERE u.deleted_at IS NULL AND u.identity NOT LIKE 'preview:%'
        GROUP BY u.id,u.nick
        HAVING COUNT(h.episode)>0
        ORDER BY watched_episodes DESC,tracked_episodes DESC,u.nick ASC LIMIT 10`)
      .all(),
    db()
      .prepare(
        'SELECT provider,status,latency_ms,error,checked_at FROM provider_health ORDER BY provider',
      )
      .all(),
    db()
      .prepare(`SELECT
      count(*) FILTER (WHERE status='succeeded') AS paid,
      count(*) FILTER (WHERE status='pending' AND created_at<?) AS pending,
      count(*) AS total FROM orders WHERE created_at>=?`)
      .bind(timestamp - 3600000, timestamp - 30 * 86400000)
      .first<{ paid: number; pending: number; total: number }>(),
  ]);
  const activityByDay = new Map(
    dailyActivity.results.map((item: any) => [
      String(item.day),
      Number(item.n),
    ]),
  );
  const viewByDay = new Map(
    daily.results.map((item: any) => [String(item.day), Number(item.n)]),
  );
  const activity = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(timestamp - index * 86400000)
      .toISOString()
      .slice(0, 10);
    return {
      day: date,
      views: viewByDay.get(date) || 0,
      active: activityByDay.get(date) || 0,
    };
  });
  return {
    dau: dau?.n || 0,
    mau: mau?.n || 0,
    views: views?.n || 0,
    users: users?.n || 0,
    daily: activity,
    signups7d: signups7d?.n || 0,
    signups30d: signups30d?.n || 0,
    views7d: views7d?.n || 0,
    views30d: views30d?.n || 0,
    recentLogins: recentLogins?.n || 0,
    premiumUsers: premiumUsers?.n || 0,
    watchHours: Math.round(((watchStats?.seconds || 0) / 3600) * 10) / 10,
    trackedEpisodes: watchStats?.tracked || 0,
    completedEpisodes: watchStats?.completed || 0,
    favorites: favorites?.n || 0,
    comments30d: comments30d?.n || 0,
    openReports: openReports?.n || 0,
    catalogTitles: catalogTitles?.n || 0,
    recommendationCount: recommendationStats?.recommendations || 0,
    recommendationUsers: recommendationStats?.users || 0,
    topAnime: topAnime.results.map((item: any) => {
      let anime: any = null;
      try {
        anime = item.data ? JSON.parse(String(item.data)) : null;
      } catch {}
      return {
        id: Number(item.anime_id),
        title: anime?.russian || anime?.name || `Аниме #${item.anime_id}`,
        views: Number(item.views),
      };
    }),
    topUsers: topUsers.results.map((item: any) => ({
      id: String(item.id),
      nick: String(item.nick || 'Без имени'),
      watchedEpisodes: Number(item.watched_episodes || 0),
      trackedEpisodes: Number(item.tracked_episodes || 0),
    })),
    providers: providers.results,
    paidOrders30d: Number(paymentStats?.paid || 0),
    pendingOrders30d: Number(paymentStats?.pending || 0),
    paymentConversion30d: paymentStats?.total
      ? Math.round(
          (Number(paymentStats.paid) / Number(paymentStats.total)) * 100,
        )
      : null,
  };
}
