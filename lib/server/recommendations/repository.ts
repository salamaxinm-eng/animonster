import type { Anime } from '@/lib/anime';
import { db, now } from '@/lib/server/core';
import {
  RECOMMENDATION_ALGORITHM_VERSION,
  RECOMMENDATION_LOCK_MS,
  RECOMMENDATION_MAX_CANDIDATES,
  RECOMMENDATION_MAX_HISTORY,
  RECOMMENDATION_MAX_NEIGHBOUR_EVENTS,
  RECOMMENDATION_MAX_SIMILAR_USERS,
  RECOMMENDATION_RESULT_LIMIT,
  RECOMMENDATION_STALE_AFTER_MS,
} from './config';
import type { RankedRecommendation } from './engine';

export type HistorySignal = {
  animeId: number;
  anime: Anime;
  updatedAt: number;
  watchedSeconds: number;
  duration: number;
  episodesStarted: number;
  episodesCompleted: number;
};

export type CollectionSignal = {
  animeId: number;
  anime: Anime;
  status: string;
  rating: number;
  favorite: boolean;
};

export type RecommendationInputs = {
  candidates: Anime[];
  history: HistorySignal[];
  collection: CollectionSignal[];
  trending: Map<number, number>;
  collaborative: Map<number, number>;
};

const parseAnime = (data: string) => JSON.parse(data) as Anime;

export async function markRecommendationsDirty(userId: string, at = now()) {
  await db()
    .prepare(
      'INSERT INTO user_recommendation_state(user_id,dirty,dirty_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET dirty=1,dirty_at=excluded.dirty_at',
    )
    .bind(userId, 1, at)
    .run();
}

export async function readUserRecommendations(userId: string) {
  const rows = await db()
    .prepare(
      'SELECT r.anime_id,r.score,r.reason,r.updated_at,a.data FROM user_recommendations r JOIN anime_cache a ON a.id=r.anime_id WHERE r.user_id=? AND r.algorithm_version=? ORDER BY r.score DESC LIMIT ?',
    )
    .bind(userId, RECOMMENDATION_ALGORITHM_VERSION, RECOMMENDATION_RESULT_LIMIT)
    .all<{
      anime_id: number;
      score: number;
      reason: string;
      updated_at: number;
      data: string;
    }>();
  return rows.results.flatMap((row) => {
    try {
      return [
        {
          anime: parseAnime(row.data),
          reason: row.reason,
          updatedAt: Number(row.updated_at),
        },
      ];
    } catch {
      return [];
    }
  });
}

export async function hasRecommendationSignals(userId: string) {
  return !!(await db()
    .prepare(
      'SELECT 1 AS present WHERE EXISTS(SELECT 1 FROM history WHERE user_id=?) OR EXISTS(SELECT 1 FROM collection WHERE user_id=?)',
    )
    .bind(userId, userId)
    .first());
}

export async function ensureRecommendationState(userId: string) {
  const at = now();
  await db()
    .prepare(
      'INSERT INTO user_recommendation_state(user_id,dirty,dirty_at) VALUES (?,?,?) ON CONFLICT(user_id) DO NOTHING',
    )
    .bind(userId, 1, at)
    .run();
  const state = await db()
    .prepare(
      'SELECT dirty,last_computed_at,algorithm_version FROM user_recommendation_state WHERE user_id=?',
    )
    .bind(userId)
    .first<{
      dirty: number;
      last_computed_at: number | null;
      algorithm_version: number;
    }>();
  if (
    !state ||
    (!state.dirty &&
      (state.algorithm_version !== RECOMMENDATION_ALGORITHM_VERSION ||
        !state.last_computed_at ||
        Number(state.last_computed_at) < at - RECOMMENDATION_STALE_AFTER_MS))
  )
    await markRecommendationsDirty(userId, at);
}

async function loadCandidates() {
  const rows = await db()
    .prepare('SELECT data FROM anime_cache ORDER BY updated_at DESC LIMIT ?')
    .bind(RECOMMENDATION_MAX_CANDIDATES)
    .all<{ data: string }>();
  return rows.results.flatMap((row) => {
    try {
      return [parseAnime(row.data)];
    } catch {
      return [];
    }
  });
}

async function loadHistory(userId: string) {
  const rows = await db()
    .prepare(
      `SELECT recent.anime_id,max(a.data) AS data,max(recent.updated_at) AS updated_at,sum(recent.watched_seconds) AS watched_seconds,sum(recent.duration) AS duration,count(*) AS episodes_started,sum(recent.completed) AS episodes_completed
       FROM (SELECT anime_id,updated_at,watched_seconds,duration,completed FROM history WHERE user_id=? ORDER BY updated_at DESC LIMIT ?) recent
       JOIN anime_cache a ON a.id=recent.anime_id
       GROUP BY recent.anime_id
       ORDER BY updated_at DESC`,
    )
    .bind(userId, RECOMMENDATION_MAX_HISTORY)
    .all<{
      anime_id: number;
      data: string;
      updated_at: number;
      watched_seconds: number;
      duration: number;
      episodes_started: number;
      episodes_completed: number;
    }>();
  return rows.results.flatMap((row) => {
    try {
      return [
        {
          animeId: Number(row.anime_id),
          anime: parseAnime(row.data),
          updatedAt: Number(row.updated_at),
          watchedSeconds: Number(row.watched_seconds),
          duration: Number(row.duration),
          episodesStarted: Number(row.episodes_started),
          episodesCompleted: Number(row.episodes_completed),
        } satisfies HistorySignal,
      ];
    } catch {
      return [];
    }
  });
}

async function loadCollection(userId: string) {
  const rows = await db()
    .prepare(
      'SELECT c.anime_id,c.status,c.rating,c.favorite,a.data FROM collection c JOIN anime_cache a ON a.id=c.anime_id WHERE c.user_id=? ORDER BY c.favorite DESC,c.rating DESC LIMIT ?',
    )
    .bind(userId, RECOMMENDATION_MAX_HISTORY)
    .all<{
      anime_id: number;
      status: string;
      rating: number;
      favorite: number;
      data: string;
    }>();
  return rows.results.flatMap((row) => {
    try {
      return [
        {
          animeId: Number(row.anime_id),
          anime: parseAnime(row.data),
          status: row.status,
          rating: Number(row.rating),
          favorite: !!row.favorite,
        } satisfies CollectionSignal,
      ];
    } catch {
      return [];
    }
  });
}

async function loadTrending() {
  const rows = await db()
    .prepare(
      'SELECT anime_id,count(*) AS views FROM daily_views WHERE day>=? GROUP BY anime_id ORDER BY views DESC LIMIT 200',
    )
    .bind(new Date(now() - 6 * 86_400_000).toISOString().slice(0, 10))
    .all<{ anime_id: number; views: number }>();
  const maximum = Math.max(1, ...rows.results.map((row) => Number(row.views)));
  return new Map(
    rows.results.map((row) => [
      Number(row.anime_id),
      Number(row.views) / maximum,
    ]),
  );
}

async function loadCollaborative(userId: string, positiveAnimeIds: number[]) {
  const ids = [...new Set(positiveAnimeIds)].slice(
    0,
    RECOMMENDATION_MAX_HISTORY,
  );
  if (!ids.length) return new Map<number, number>();
  const placeholders = ids.map(() => '?').join(',');
  const similar = await db()
    .prepare(
      `SELECT signals.user_id,count(*) AS overlap
       FROM (
         SELECT DISTINCT user_id,anime_id FROM history WHERE completed=1 AND anime_id IN (${placeholders})
         UNION
         SELECT DISTINCT user_id,anime_id FROM collection WHERE (favorite=1 OR rating>=8 OR status='completed') AND anime_id IN (${placeholders})
       ) signals
       WHERE signals.user_id<>?
       GROUP BY signals.user_id
       ORDER BY overlap DESC
       LIMIT ?`,
    )
    .bind(...ids, ...ids, userId, RECOMMENDATION_MAX_SIMILAR_USERS)
    .all<{ user_id: string; overlap: number }>();
  if (!similar.results.length) return new Map<number, number>();
  const users = similar.results.map((row) => row.user_id);
  const userPlaceholders = users.map(() => '?').join(',');
  const events = await db()
    .prepare(
      `SELECT user_id,anime_id,max(strength) AS strength
       FROM (
         SELECT user_id,anime_id,1.0 AS strength FROM history WHERE completed=1 AND user_id IN (${userPlaceholders})
         UNION ALL
         SELECT user_id,anime_id,CASE WHEN favorite=1 THEN 1.0 WHEN rating>=8 THEN 0.9 ELSE 0.75 END AS strength FROM collection WHERE (favorite=1 OR rating>=8 OR status='completed') AND user_id IN (${userPlaceholders})
       ) neighbour_events
       GROUP BY user_id,anime_id
       LIMIT ?`,
    )
    .bind(...users, ...users, RECOMMENDATION_MAX_NEIGHBOUR_EVENTS)
    .all<{ user_id: string; anime_id: number; strength: number }>();
  const sizes = new Map<string, number>();
  for (const event of events.results)
    sizes.set(event.user_id, (sizes.get(event.user_id) || 0) + 1);
  const similarities = new Map(
    similar.results.map((row) => [
      row.user_id,
      Number(row.overlap) /
        Math.sqrt(Math.max(1, ids.length * (sizes.get(row.user_id) || 1))),
    ]),
  );
  const scores = new Map<number, number>();
  for (const event of events.results) {
    const animeId = Number(event.anime_id);
    scores.set(
      animeId,
      (scores.get(animeId) || 0) +
        (similarities.get(event.user_id) || 0) * Number(event.strength),
    );
  }
  const maximum = Math.max(1, ...scores.values());
  for (const [animeId, score] of scores) scores.set(animeId, score / maximum);
  return scores;
}

export async function loadRecommendationInputs(
  userId: string,
): Promise<RecommendationInputs> {
  const [candidates, history, collection, trending] = await Promise.all([
    loadCandidates(),
    loadHistory(userId),
    loadCollection(userId),
    loadTrending(),
  ]);
  const positive = new Set<number>();
  for (const item of history)
    if (item.episodesCompleted > 0) positive.add(item.animeId);
  for (const item of collection)
    if (item.favorite || item.rating >= 8 || item.status === 'completed')
      positive.add(item.animeId);
  const collaborative = await loadCollaborative(userId, [...positive]);
  return { candidates, history, collection, trending, collaborative };
}

export async function saveRecommendations(
  userId: string,
  recommendations: RankedRecommendation[],
  at = now(),
) {
  const statements = [
    db()
      .prepare('DELETE FROM user_recommendations WHERE user_id=?')
      .bind(userId),
    ...recommendations.map((item) =>
      db()
        .prepare(
          'INSERT INTO user_recommendations(user_id,anime_id,score,reason,source,algorithm_version,updated_at) VALUES (?,?,?,?,?,?,?)',
        )
        .bind(
          userId,
          item.anime.id,
          item.score,
          item.reason,
          item.source,
          RECOMMENDATION_ALGORITHM_VERSION,
          at,
        ),
    ),
    db()
      .prepare(
        'INSERT INTO user_recommendation_state(user_id,dirty,dirty_at,last_computed_at,algorithm_version,locked_until,last_error) VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET dirty=0,last_computed_at=excluded.last_computed_at,algorithm_version=excluded.algorithm_version,locked_until=NULL,last_error=NULL',
      )
      .bind(userId, 0, at, at, RECOMMENDATION_ALGORITHM_VERSION, null, null),
  ];
  await db().batch(statements);
}

export async function claimRecommendationUsers(limit: number) {
  const at = now();
  const rows = await db()
    .prepare(
      `SELECT u.id
       FROM users u
       LEFT JOIN user_recommendation_state s ON s.user_id=u.id
       WHERE u.deleted_at IS NULL
         AND (s.user_id IS NULL OR s.dirty=1 OR s.algorithm_version<>? OR s.last_computed_at IS NULL OR s.last_computed_at<?)
         AND (s.locked_until IS NULL OR s.locked_until<?)
       ORDER BY coalesce(s.dirty_at,u.created_at)
       LIMIT ?`,
    )
    .bind(
      RECOMMENDATION_ALGORITHM_VERSION,
      at - RECOMMENDATION_STALE_AFTER_MS,
      at,
      limit,
    )
    .all<{ id: string }>();
  const claimed: string[] = [];
  for (const row of rows.results) {
    const locked = await db()
      .prepare(
        'INSERT INTO user_recommendation_state(user_id,dirty,dirty_at,locked_until) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET locked_until=excluded.locked_until WHERE user_recommendation_state.locked_until IS NULL OR user_recommendation_state.locked_until<? RETURNING user_id',
      )
      .bind(row.id, 1, at, at + RECOMMENDATION_LOCK_MS, at)
      .first<{ user_id: string }>();
    if (locked) claimed.push(locked.user_id);
  }
  return claimed;
}

export async function claimRecommendationUser(userId: string) {
  const at = now();
  const user = await db()
    .prepare('SELECT id FROM users WHERE id=? AND deleted_at IS NULL')
    .bind(userId)
    .first<{ id: string }>();
  if (!user) return false;
  await db()
    .prepare(
      'INSERT INTO user_recommendation_state(user_id,dirty,dirty_at,locked_until) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET dirty=1,dirty_at=excluded.dirty_at,locked_until=excluded.locked_until',
    )
    .bind(userId, 1, at, at + RECOMMENDATION_LOCK_MS)
    .run();
  return true;
}

export async function failRecommendationUser(userId: string, error: string) {
  await db()
    .prepare(
      'UPDATE user_recommendation_state SET dirty=1,dirty_at=?,locked_until=NULL,last_error=? WHERE user_id=?',
    )
    .bind(now(), error.slice(0, 500), userId)
    .run();
}

export async function loadFallbackCandidates() {
  const [candidates, trending] = await Promise.all([
    loadCandidates(),
    loadTrending(),
  ]);
  return { candidates, trending };
}
