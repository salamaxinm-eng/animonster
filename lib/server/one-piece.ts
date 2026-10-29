import { ApiError, db, now, uid } from './core';
import {
  ONE_PIECE_ID,
  pieceProgress,
  pirateRank,
  type PieceCatalog,
  type PieceAchievement,
  type PieceCompletion,
  type PieceState,
  type PieceOverview,
} from '../one-piece';

export type PieceTx = ReturnType<typeof db>;
const parsed = <T>(value: unknown): T =>
  (typeof value === 'string' ? JSON.parse(value) : value) as T;
type Rule = PieceAchievement & { id: string; active: boolean };
export async function loadPieceCatalog(
  tx: PieceTx = db(),
): Promise<PieceCatalog> {
  const row = await tx
    .prepare(
      'SELECT config FROM achievement_catalogs WHERE anime_id=? AND active=true',
    )
    .bind(ONE_PIECE_ID)
    .first<{ config: unknown }>();
  if (!row) throw new ApiError('Путешествие One Piece пока недоступно', 503);
  return parsed<PieceCatalog>(row.config);
}
async function rules(tx: PieceTx): Promise<Rule[]> {
  const rows = await tx
    .prepare(`SELECT id,code,name,description,category,rarity,xp_reward,icon,is_secret,condition_config,active
    FROM achievements WHERE anime_id=? AND metric='verified_condition' ORDER BY sort_order,id`)
    .bind(ONE_PIECE_ID)
    .all<{
      id: string;
      code: string;
      name: string;
      description: string;
      category: string;
      rarity: string;
      xp_reward: number;
      icon: string;
      is_secret: boolean;
      condition_config: unknown;
      active: number;
    }>();
  return rows.results.map((row) => ({
    id: row.id,
    code: row.code,
    number: Number(row.code.slice(-3)),
    name: row.name,
    description: row.description,
    category: row.category,
    rarity: row.rarity,
    xp: Number(row.xp_reward),
    icon: row.icon,
    secret: row.is_secret,
    condition: parsed(row.condition_config),
    reward: null,
    active: !!row.active,
  }));
}
export async function pieceCompletions(
  user: string,
  tx: PieceTx = db(),
): Promise<PieceCompletion[]> {
  const rows = await tx
    .prepare(`SELECT h.episode,h.verified_completed_at FROM history h
    JOIN anime_episode_registry e ON e.id=h.episode_id AND e.anime_id=h.anime_id AND e.episode_number=h.episode AND e.eligible
    WHERE h.user_id=? AND h.anime_id=? AND h.verified_completed_at IS NOT NULL
    UNION ALL SELECT e.episode_number AS episode,c.completed_at AS verified_completed_at
    FROM episode_completion_events c JOIN anime_episode_registry e ON e.id=c.episode_id AND e.eligible AND e.anime_id=?
    WHERE c.user_id=? AND c.completion_index>0 AND c.completed_at>=?
    ORDER BY verified_completed_at,episode`)
    .bind(user, ONE_PIECE_ID, ONE_PIECE_ID, user, now() - 7 * 86400000)
    .all<{ episode: number; verified_completed_at: number }>();
  return rows.results.map((row) => ({
    episode: row.episode,
    completedAt: Number(row.verified_completed_at),
  }));
}

// Caller holds the account clock lock; every award, XP, cosmetic and notification
// is part of the SAME transaction as the confirming playback event.
export async function evaluatePieceInTransaction(
  tx: PieceTx,
  user: string,
  state: PieceState,
  stamp = now(),
) {
  await tx
    .prepare("SELECT set_config('animonster.verified_achievement_user',?,true)")
    .bind(user)
    .first();
  const catalog = await loadPieceCatalog(tx);
  const definitions = await rules(tx);
  const rows = await pieceCompletions(user, tx);
  const saved = await tx
    .prepare(`SELECT a.code FROM user_achievements ua JOIN achievements a ON a.id=ua.achievement_id
    WHERE ua.user_id=? AND a.anime_id=? AND a.metric='verified_condition'`)
    .bind(user, ONE_PIECE_ID)
    .all<{ code: string }>();
  const earned = new Set(
    saved.results.map((row) => Number(row.code.slice(-3))),
  );
  const unlocked: string[] = [];
  for (const rule of definitions) {
    if (
      !rule.active ||
      earned.has(rule.number) ||
      !pieceProgress(rule, catalog, rows, state, earned).done
    )
      continue;
    const added = await tx
      .prepare(`INSERT INTO user_achievements(user_id,achievement_id,unlocked_at,xp_awarded,reward_claimed)
      VALUES (?,?,?,?,true) ON CONFLICT DO NOTHING RETURNING achievement_id`)
      .bind(user, rule.id, stamp, rule.xp)
      .first();
    if (!added) {
      earned.add(rule.number);
      continue;
    }
    await tx
      .prepare('UPDATE users SET achievement_xp=achievement_xp+? WHERE id=?')
      .bind(rule.xp, user)
      .run();
    const rewards = await tx
      .prepare(
        `SELECT c.id,c.slug,c.active FROM achievement_rewards ar JOIN cosmetics c ON c.id=ar.cosmetic_id WHERE ar.achievement_id=?`,
      )
      .bind(rule.id)
      .all<{ id: string; slug: string; active: number }>();
    const expected = catalog.achievements.find(
      (item) => item.code === rule.code,
    )?.reward;
    if (
      expected &&
      !rewards.results.some((item) => item.slug === expected && item.active)
    )
      throw new ApiError('Награда достижения ещё не настроена', 503);
    for (const reward of rewards.results) {
      if (!reward.active)
        throw new ApiError('Награда временно недоступна', 503);
      await tx
        .prepare(`INSERT INTO user_cosmetics(user_id,cosmetic_id,unlocked_at,source,source_key,metadata)
        VALUES (?,?,?,'achievement',?,?::text::jsonb) ON CONFLICT(user_id,cosmetic_id) DO NOTHING`)
        .bind(
          user,
          reward.id,
          stamp,
          `${rule.id}:${reward.slug}`,
          JSON.stringify({ achievement: rule.code, catalog: catalog.version }),
        )
        .run();
    }
    await tx
      .prepare(`INSERT INTO notifications(id,user_id,actor_id,scope,comment_id,created_at,achievement_id)
      VALUES (?,?,?,'achievement:one-piece',NULL,?,?) ON CONFLICT DO NOTHING`)
      .bind(uid(), user, user, stamp, rule.id)
      .run();
    earned.add(rule.number);
    unlocked.push(rule.code);
  }
  return unlocked;
}

export async function onePieceOverview(user?: string): Promise<PieceOverview> {
  const tx = db(),
    catalog = await loadPieceCatalog(tx),
    definitions = await rules(tx);
  const completed = user ? await pieceCompletions(user, tx) : [];
  const ids = new Set(completed.map((row) => row.episode));
  const saved = user
    ? (
        await tx
          .prepare(`SELECT ua.achievement_id,ua.unlocked_at,ua.xp_awarded FROM user_achievements ua
    JOIN achievements a ON a.id=ua.achievement_id WHERE ua.user_id=? AND a.metric='verified_condition' AND a.anime_id=?`)
          .bind(user, ONE_PIECE_ID)
          .all<{
            achievement_id: string;
            unlocked_at: number;
            xp_awarded: number;
          }>()
      ).results
    : [];
  const byId = new Map(saved.map((row) => [row.achievement_id, row]));
  const earned = new Set(
    definitions.filter((rule) => byId.has(rule.id)).map((rule) => rule.number),
  );
  const clock = user
    ? await tx
        .prepare('SELECT one_piece_state FROM pass_watch_clock WHERE user_id=?')
        .bind(user)
        .first<{ one_piece_state: unknown }>()
    : null;
  const state: PieceState = clock ? parsed(clock.one_piece_state) : {};
  // Expired continuous-session progress is not shown as if the session were live.
  if (Number(state.lastActivity || 0) < now() - 3600000)
    state.sessionEpisodes = [];
  const rewards = (
    await tx
      .prepare(`SELECT ar.achievement_id,c.name,c.slug,c.kind,c.image FROM achievement_rewards ar
    JOIN cosmetics c ON c.id=ar.cosmetic_id JOIN achievements a ON a.id=ar.achievement_id
    WHERE a.anime_id=? AND a.metric='verified_condition' AND c.active=1`)
      .bind(ONE_PIECE_ID)
      .all<{
        achievement_id: string;
        name: string;
        slug: string;
        kind: string;
        image: string | null;
      }>()
  ).results;
  const achievements = definitions.map((rule) => {
    const saved = byId.get(rule.id),
      hidden = rule.secret && !saved;
    const progress = pieceProgress(rule, catalog, completed, state, earned);
    return {
      id: rule.id,
      code: rule.code,
      name: hidden ? '???' : rule.name,
      description: hidden ? 'Секретное достижение' : rule.description,
      category: rule.category,
      rarity: rule.rarity,
      icon: hidden ? 'lock' : rule.icon,
      xp_reward: saved ? Number(saved.xp_awarded) : rule.xp,
      progress: saved ? progress.target : hidden ? 0 : progress.progress,
      threshold: hidden ? 1 : progress.target,
      completed: !!saved,
      unlocked_at: saved ? Number(saved.unlocked_at) : null,
      available: rule.active && progress.available,
      secret: hidden,
      rewards: hidden
        ? []
        : rewards
            .filter((reward) => reward.achievement_id === rule.id)
            .map(({ name, slug, kind, image }) => ({
              name,
              slug,
              kind,
              image,
            })),
    };
  });
  const current = catalog.arcs.find(
    (arc) =>
      !arc.complete || !arc.episodes.every((episode) => ids.has(episode)),
  );
  const total = catalog.snapshotEpisodes.length;
  return {
    version: catalog.version,
    count: ids.size,
    total,
    xp: saved.reduce((sum, row) => sum + Number(row.xp_awarded), 0),
    rank: pirateRank(ids.size, earned.has(30)),
    unlocked: saved.length,
    currentSaga:
      catalog.sagas.find((saga) => saga.id === current?.saga)?.name ||
      'Путешествие продолжается',
    progress: Math.floor(
      (catalog.snapshotEpisodes.filter((episode) => ids.has(episode)).length /
        Math.max(1, total)) *
        100,
    ),
    authenticated: !!user,
    achievements,
    arcs: catalog.arcs.map((arc) => ({
      id: arc.id,
      name: arc.name,
      saga:
        catalog.sagas.find((saga) => saga.id === arc.saga)?.name || arc.saga,
      progress: arc.episodes.filter((episode) => ids.has(episode)).length,
      total: arc.episodes.length,
      completed:
        arc.complete && arc.episodes.every((episode) => ids.has(episode)),
      available: arc.complete,
      current: arc.id === current?.id,
      achievement: arc.achievement
        ? `ACH_ONE_PIECE_${String(arc.achievement).padStart(3, '0')}`
        : null,
      reward:
        definitions.find((rule) => rule.number === arc.achievement)?.xp || 0,
    })),
  };
}

export async function synchronizePiece(user: string) {
  return db().transaction(async (tx) => {
    await tx
      .prepare(
        'INSERT INTO pass_watch_clock(user_id) VALUES (?) ON CONFLICT DO NOTHING',
      )
      .bind(user)
      .run();
    const clock = await tx
      .prepare(
        'SELECT one_piece_state FROM pass_watch_clock WHERE user_id=? FOR UPDATE',
      )
      .bind(user)
      .first<{ one_piece_state: unknown }>();
    return {
      unlocked: await evaluatePieceInTransaction(
        tx,
        user,
        parsed(clock!.one_piece_state),
      ),
    };
  });
}

export async function claimPieceNotices(user: string) {
  return db().transaction(async (tx) => {
    const rows = await tx
      .prepare(`SELECT ua.achievement_id,a.name,a.description,a.rarity,ua.xp_awarded
      FROM user_achievements ua JOIN achievements a ON a.id=ua.achievement_id
      WHERE ua.user_id=? AND a.metric='verified_condition' AND a.anime_id=? AND ua.toast_seen_at IS NULL
      ORDER BY ua.unlocked_at,ua.achievement_id LIMIT 3 FOR UPDATE OF ua SKIP LOCKED`)
      .bind(user, ONE_PIECE_ID)
      .all<{
        achievement_id: string;
        name: string;
        description: string;
        rarity: string;
        xp_awarded: number;
      }>();
    for (const item of rows.results)
      await tx
        .prepare(
          'UPDATE user_achievements SET toast_seen_at=? WHERE user_id=? AND achievement_id=?',
        )
        .bind(now(), user, item.achievement_id)
        .run();
    return rows.results;
  });
}
