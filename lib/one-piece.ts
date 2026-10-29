import { coverageSeconds, mergeCoverage, type Range } from './battlepass';

export const ONE_PIECE_ID = 21;
export type PieceCondition = {
  type:
    | 'episodes'
    | 'count'
    | 'arc'
    | 'saga'
    | 'snapshot'
    | 'session'
    | 'return'
    | 'backtrack'
    | 'night'
    | 'rolling'
    | 'rewatch'
    | 'saga_achievements';
  target?: number;
  episodes?: number[];
  key?: string;
  version?: string;
  days?: number;
  distance?: number;
  from?: number;
  to?: number;
  episode?: number;
  after?: number;
};
export type PieceAchievement = {
  number: number;
  code: string;
  name: string;
  description: string;
  rarity: string;
  xp: number;
  category: string;
  secret: boolean;
  condition: PieceCondition;
  reward: string | null;
  icon: string;
};
export type PieceArc = {
  id: string;
  name: string;
  episodes: number[];
  saga: string;
  achievement: number | null;
  complete: boolean;
};
export type PieceSaga = {
  id: string;
  name: string;
  arcs: string[];
  episodes: number[];
  complete: boolean;
  achievement: number | null;
};
export type PieceCatalog = {
  version: string;
  animeId: number;
  snapshotEpisodes: number[];
  excludedSpecials: number[];
  arcs: PieceArc[];
  sagas: PieceSaga[];
  achievements: PieceAchievement[];
};
export type PieceState = {
  lastActivity?: number;
  sessionEpisodes?: number[];
  lastCompleted?: number;
  returnGap?: number;
  backtrackDistance?: number;
  completionHours?: number[];
  rewatchedAfter?: number;
};
export type PieceCompletion = { episode: number; completedAt: number };
export function episodeKey(episode: number) {
  return `tv:21:episode:${episode}`;
}
export function validTimezone(raw: unknown) {
  if (typeof raw !== 'string' || raw.length > 80) return null;
  try {
    new Intl.DateTimeFormat('en', { timeZone: raw }).format();
    return raw;
  } catch {
    return null;
  }
}
export function nightAt(time: number, timezone: string) {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(time),
  );
  return hour >= 2 && hour < 5;
}
export function largestRollingCount(rows: PieceCompletion[], days = 7) {
  const events = rows
    .filter((row) => Number.isFinite(row.completedAt))
    .sort((a, b) => a.completedAt - b.completedAt);
  const episodes = new Map<number, number>();
  let start = 0,
    largest = 0;
  for (let end = 0; end < events.length; end++) {
    episodes.set(
      events[end].episode,
      (episodes.get(events[end].episode) || 0) + 1,
    );
    while (
      events[end].completedAt - events[start].completedAt >=
      days * 86400000
    ) {
      const old = events[start++].episode,
        count = episodes.get(old)! - 1;
      if (count) episodes.set(old, count);
      else episodes.delete(old);
    }
    largest = Math.max(largest, episodes.size);
  }
  return largest;
}
export function pieceProgress(
  rule: PieceAchievement,
  catalog: PieceCatalog,
  rows: PieceCompletion[],
  state: PieceState,
  earned: Set<number>,
) {
  const completed = new Set(rows.map((row) => row.episode));
  const c = rule.condition;
  let required: number[] | undefined,
    available = true,
    progress = 0,
    target = c.target || 1;
  if (c.type === 'episodes') required = c.episodes || [];
  if (c.type === 'snapshot') required = c.episodes || catalog.snapshotEpisodes;
  if (c.type === 'arc' || c.type === 'saga') {
    const item = (c.type === 'arc' ? catalog.arcs : catalog.sagas).find(
      (item) => item.id === c.key,
    );
    required = item?.episodes || [];
    available = !!item?.complete;
  }
  if (required) {
    available &&= required.length > 0;
    target = Math.max(1, required.length);
    progress = required.filter((episode) => completed.has(episode)).length;
  } else if (c.type === 'count') progress = completed.size;
  else if (c.type === 'session')
    progress = new Set(state.sessionEpisodes || []).size;
  else if (c.type === 'return')
    progress = (state.returnGap || 0) >= (c.days || 30) * 86400000 ? 1 : 0;
  else if (c.type === 'backtrack')
    progress = (state.backtrackDistance || 0) >= (c.distance || 2) ? 1 : 0;
  else if (c.type === 'night')
    progress = (state.completionHours || []).some(
      (hour) => hour >= (c.from ?? 2) && hour < (c.to ?? 5),
    )
      ? 1
      : 0;
  else if (c.type === 'rewatch')
    progress = (state.rewatchedAfter || 0) >= (c.after || 500) ? 1 : 0;
  else if (c.type === 'rolling') progress = largestRollingCount(rows, c.days);
  else if (c.type === 'saga_achievements')
    progress = catalog.sagas.some((saga) => {
      const awards = catalog.arcs
        .filter((arc) => arc.saga === saga.id && arc.achievement)
        .map((arc) => arc.achievement!);
      return (
        saga.complete &&
        awards.length > 0 &&
        awards.every((number) => earned.has(number))
      );
    })
      ? 1
      : 0;
  return {
    progress: Math.min(target, progress),
    target,
    available,
    done: available && progress >= target,
  };
}
export function pirateRank(count: number, king: boolean) {
  if (king) return 'Король пиратов';
  return count >= 1000
    ? 'Претендент на Короля пиратов'
    : count >= 750
      ? 'Легенда Нового Мира'
      : count >= 500
        ? 'Супернова'
        : count >= 250
          ? 'Капитан'
          : count >= 100
            ? 'Пират Гранд Лайн'
            : count >= 50
              ? 'Морской волк'
              : count >= 10
                ? 'Начинающий пират'
                : 'Новобранец';
}

export type PieceSample = { t: number; p: number; rate?: number };
// Actual media movement is credited (including 0.5–2x). A seek, pause, sparse
// sample, or rate transition establishes a new baseline and never fills a gap.
export function verifiedMovement(a: PieceSample, b: PieceSample) {
  const wall = (b.t - a.t) / 1000,
    movement = b.p - a.p,
    rate = b.rate ?? 2;
  return wall > 0 &&
    wall <= 5 &&
    rate >= 0.5 &&
    rate <= 2 &&
    rate === (a.rate ?? 2) &&
    movement > 0 &&
    movement <= wall * rate * 1.15 + 0.2
    ? movement
    : 0;
}
export function addVerifiedCoverage(
  ranges: Range[],
  from: number,
  to: number,
  duration: number,
) {
  const merged = mergeCoverage(ranges, [from, to], duration);
  // Reject fragmentation instead of merging unobserved gaps.
  if (merged.length > 4096) return { ranges, complete: false };
  return {
    ranges: merged,
    complete: coverageSeconds(merged) + 0.001 >= duration * 0.7,
  };
}

export type PieceAchievementView = {
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  rarity: string;
  icon: string;
  xp_reward: number;
  progress: number;
  threshold: number;
  completed: boolean;
  unlocked_at: number | null;
  available: boolean;
  secret: boolean;
  rewards: { name: string; slug: string; kind: string; image: string | null }[];
};
export type PieceOverview = {
  version: string;
  count: number;
  total: number;
  xp: number;
  rank: string;
  unlocked: number;
  currentSaga: string;
  progress: number;
  authenticated: boolean;
  achievements: PieceAchievementView[];
  arcs: {
    id: string;
    name: string;
    saga: string;
    progress: number;
    total: number;
    completed: boolean;
    available: boolean;
    current: boolean;
    achievement: string | null;
    reward: number;
  }[];
};
