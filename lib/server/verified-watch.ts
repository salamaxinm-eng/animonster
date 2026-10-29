import { ApiError, db, now, uid } from './core';
import { coverageSeconds, type Range } from '../battlepass';
import {
  ONE_PIECE_ID,
  episodeKey,
  addVerifiedCoverage,
  verifiedMovement,
  type PieceSample,
  type PieceState,
} from '../one-piece';
import { evaluatePieceInTransaction, loadPieceCatalog } from './one-piece';

type Selection = {
  episode: number;
  duration: number;
  provider: string;
  voiceover: string;
  timezone: string;
  durationBasis: string;
};
type Session = {
  token: string;
  episode: number;
  episode_key: string;
  duration: number;
  provider: string;
  voiceover: string;
  seq: number;
  sample_t: number | null;
  sample_p: number | null;
  sample_rate: number | null;
  created_at: number;
  expires: number;
  timezone: string;
};
type Progress = {
  watched_intervals: Range[];
  verified_duration: number | null;
  verified_completed_at: number | null;
  rewatch_intervals: Range[];
  rewatch_count: number;
};
function parsed<T>(value: T | string): T {
  return typeof value === 'string' ? (JSON.parse(value) as T) : value;
}

// Selection is resolved/validated by the authenticated route. It cannot grant
// anything: only later, wall-clock-bounded playback samples can complete a series.
export async function startVerifiedWatch(
  user: string,
  auth: string,
  selection: Selection,
) {
  const stamp = now(),
    catalog = await loadPieceCatalog();
  if (catalog.excludedSpecials.includes(selection.episode))
    return {
      token: null,
      notice: 'Спецвыпуск не участвует в достижениях основной серии.',
    };
  return db().transaction(async (tx) => {
    await tx
      .prepare(
        'INSERT INTO pass_watch_clock(user_id) VALUES (?) ON CONFLICT DO NOTHING',
      )
      .bind(user)
      .run();
    await tx
      .prepare(
        'SELECT user_id FROM pass_watch_clock WHERE user_id=? FOR UPDATE',
      )
      .bind(user)
      .first();
    const count = await tx
      .prepare(
        "SELECT count(*) AS n FROM watch_sessions WHERE user_id=? AND tracking_kind='verified' AND created_at>?",
      )
      .bind(user, stamp - 60000)
      .first<{ n: number }>();
    if (Number(count?.n) >= 20)
      throw new ApiError('Слишком много запусков плеера', 429);
    const key = episodeKey(selection.episode),
      token = uid();
    await tx
      .prepare(
        'INSERT INTO anime_episode_registry(id,anime_id,episode_number) VALUES (?,?,?) ON CONFLICT DO NOTHING',
      )
      .bind(key, ONE_PIECE_ID, selection.episode)
      .run();
    await tx
      .prepare(`INSERT INTO watch_sessions(token,actor,user_id,anime_id,episode,duration,last_at,expires,provider,voiceover,
      tracking_kind,auth_hash,created_at,timezone,episode_key,duration_basis)
      VALUES (?,?,?,?,?,?,?,?,?,?,'verified',?,?,?,?,?)`)
      .bind(
        token,
        'verified:' + user,
        user,
        ONE_PIECE_ID,
        selection.episode,
        Math.floor(selection.duration),
        stamp,
        stamp + 14400000,
        selection.provider,
        selection.voiceover,
        auth,
        stamp,
        selection.timezone,
        key,
        selection.durationBasis,
      )
      .run();
    return { token, durationKnown: true, expiresAt: stamp + 14400000 };
  });
}

export async function recordVerifiedWatch(
  user: string,
  auth: string,
  token: string,
  seq: number,
  samples: PieceSample[],
) {
  if (
    !Number.isSafeInteger(seq) ||
    seq < 1 ||
    !Array.isArray(samples) ||
    !samples.length ||
    samples.length > 120 ||
    samples.some(
      (sample) =>
        !sample ||
        !Number.isFinite(sample.t) ||
        sample.t < 0 ||
        !Number.isFinite(sample.p) ||
        sample.p < 0 ||
        sample.p > 86400 ||
        (sample.rate !== undefined &&
          (!Number.isFinite(sample.rate) ||
            sample.rate < 0.5 ||
            sample.rate > 2)),
    )
  )
    throw new ApiError('Некорректные события просмотра');
  return db().transaction(async (tx) => {
    const clock = await tx
      .prepare(
        'SELECT achievement_credited_until,one_piece_state FROM pass_watch_clock WHERE user_id=? FOR UPDATE',
      )
      .bind(user)
      .first<{
        achievement_credited_until: number;
        one_piece_state: PieceState;
      }>();
    const session = await tx
      .prepare(
        `SELECT * FROM watch_sessions WHERE token=? AND user_id=? AND auth_hash=? AND tracking_kind='verified' FOR UPDATE`,
      )
      .bind(token, user, auth)
      .first<Session>();
    const stamp = now();
    if (!clock || !session || Number(session.expires) <= stamp)
      throw new ApiError('Сессия просмотра истекла', 409);
    if (seq <= session.seq)
      return { accepted: true, duplicate: true, unlocked: [] };
    if (seq !== session.seq + 1)
      throw new ApiError('Нарушен порядок событий', 409);
    const created = Number(session.created_at),
      last = samples.at(-1)!;
    if (
      last.t > stamp - created + 2000 ||
      last.t > 14400000 ||
      created + last.t < stamp - 300000
    )
      throw new ApiError('События не соответствуют времени сессии');
    if (samples.some((sample) => sample.p > session.duration + 2))
      throw new ApiError('Позиция за пределами серии');
    let previous: PieceSample | null =
      session.sample_t === null
        ? null
        : {
            t: Number(session.sample_t),
            p: Number(session.sample_p),
            rate:
              session.sample_rate === null
                ? undefined
                : Number(session.sample_rate),
          };
    const state = parsed<PieceState>(clock.one_piece_state);
    let floor = Number(clock.achievement_credited_until),
      shouldEvaluate = false,
      seconds = 0;
    await tx
      .prepare(`INSERT INTO history(user_id,anime_id,episode,voiceover,duration,updated_at,episode_id)
      VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id,anime_id,episode) DO NOTHING`)
      .bind(
        user,
        ONE_PIECE_ID,
        session.episode,
        session.voiceover,
        session.duration,
        stamp,
        session.episode_key,
      )
      .run();
    const history = (await tx
      .prepare(`SELECT watched_intervals,verified_duration,verified_completed_at,rewatch_intervals,rewatch_count
      FROM history WHERE user_id=? AND anime_id=? AND episode=? FOR UPDATE`)
      .bind(user, ONE_PIECE_ID, session.episode)
      .first<Progress>())!;
    let ranges = parsed<Range[]>(history.watched_intervals),
      replay = parsed<Range[]>(history.rewatch_intervals);
    // Different cuts/durations do not share a timeline. A previously awarded
    // completion remains permanent, but partial ranges cannot fill another cut.
    if (
      history.verified_duration !== null &&
      Math.abs(Number(history.verified_duration) - session.duration) > 2
    ) {
      ranges = [];
      replay = [];
    }
    let completedAt =
      history.verified_completed_at === null
        ? null
        : Number(history.verified_completed_at);
    let replays = history.rewatch_count;
    for (const sample of samples) {
      if (previous && sample.t <= previous.t)
        throw new ApiError('События должны идти по порядку');
      const movement = previous ? verifiedMovement(previous, sample) : 0;
      if (movement > 0 && previous) {
        const end = Math.min(created + sample.t, stamp),
          start = Math.max(created + previous.t, floor);
        if (end > start) {
          const gap =
            state.lastActivity === undefined
              ? 0
              : start - Number(state.lastActivity);
          if (state.lastActivity === undefined || gap >= 3600000)
            state.sessionEpisodes = [];
          if (
            state.lastActivity !== undefined &&
            gap > Number(state.returnGap || 0)
          ) {
            state.returnGap = gap;
            // Checking a return condition is an actual accepted playback event,
            // never a page visit. Other rules still wait for 70% completion.
            if (gap >= 86400000) shouldEvaluate = true;
          }
          state.lastActivity = end;
          const credited =
            movement * Math.min(1, (end - start) / (sample.t - previous.t));
          const to = Math.min(session.duration, sample.p),
            from = Math.max(0, to - credited);
          const coverage = addVerifiedCoverage(
            completedAt === null ? ranges : replay,
            from,
            to,
            session.duration,
          );
          if (completedAt === null) ranges = coverage.ranges;
          else replay = coverage.ranges;
          seconds += Math.max(0, to - from);
          floor = end;
          if (coverage.complete) {
            const first = completedAt === null;
            if (first) {
              completedAt = Math.floor(end);
              state.backtrackDistance = Math.max(
                Number(state.backtrackDistance || 0),
                Number(state.lastCompleted || session.episode) -
                  session.episode,
              );
            } else {
              replays++;
              replay = [];
              if (session.episode === 1) {
                const count = await tx
                  .prepare(`SELECT count(*) AS n FROM history h JOIN anime_episode_registry e ON e.id=h.episode_id AND e.eligible
                  WHERE h.user_id=? AND h.anime_id=? AND h.verified_completed_at IS NOT NULL`)
                  .bind(user, ONE_PIECE_ID)
                  .first<{ n: number }>();
                state.rewatchedAfter = Math.max(
                  Number(state.rewatchedAfter || 0),
                  Number(count?.n || 0),
                );
              }
            }
            state.lastCompleted = session.episode;
            await tx
              .prepare(`INSERT INTO episode_completion_events(id,user_id,episode_id,completion_index,completed_at,watch_session)
              VALUES (?,?,?,?,?,?) ON CONFLICT(user_id,episode_id,completion_index) DO NOTHING`)
              .bind(
                uid(),
                user,
                session.episode_key,
                first ? 0 : replays,
                Math.floor(end),
                token,
              )
              .run();
            state.sessionEpisodes = [
              ...new Set([...(state.sessionEpisodes || []), session.episode]),
            ];
            const hour = Number(
              new Intl.DateTimeFormat('en-GB', {
                timeZone: session.timezone,
                hour: '2-digit',
                hourCycle: 'h23',
              }).format(end),
            );
            state.completionHours = [
              ...new Set([...(state.completionHours || []), hour]),
            ];
            shouldEvaluate = true;
          }
        }
      }
      previous = sample;
    }
    await tx
      .prepare(`UPDATE history SET episode_id=?,watched_intervals=?::text::jsonb,verified_duration=?,verified_completed_at=?,
      rewatch_intervals=?::text::jsonb,rewatch_count=?,completed=GREATEST(completed,?),updated_at=CASE WHEN ?>0 THEN ? ELSE updated_at END
      WHERE user_id=? AND anime_id=? AND episode=?`)
      .bind(
        session.episode_key,
        JSON.stringify(ranges),
        session.duration,
        completedAt,
        JSON.stringify(replay),
        replays,
        completedAt === null ? 0 : 1,
        seconds,
        stamp,
        user,
        ONE_PIECE_ID,
        session.episode,
      )
      .run();
    await tx
      .prepare(
        'UPDATE pass_watch_clock SET achievement_credited_until=?,one_piece_state=?::text::jsonb WHERE user_id=?',
      )
      .bind(Math.ceil(floor), JSON.stringify(state), user)
      .run();
    const unlocked = shouldEvaluate
      ? await evaluatePieceInTransaction(
          tx,
          user,
          state,
          Math.floor(state.lastActivity || stamp),
        )
      : [];
    await tx
      .prepare(
        'UPDATE watch_sessions SET seq=?,sample_t=?,sample_p=?,sample_rate=?,last_at=? WHERE token=?',
      )
      .bind(seq, previous!.t, previous!.p, previous!.rate ?? null, stamp, token)
      .run();
    return {
      accepted: true,
      seconds,
      completed: completedAt !== null,
      percent: Math.min(
        100,
        Math.floor((coverageSeconds(ranges) / session.duration) * 100),
      ),
      unlocked,
    };
  });
}
