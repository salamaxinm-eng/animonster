import { grantPlusDays } from './plus';
import { ApiError, db, now, uid } from './core';
import { PASS_TASKS, passDay, passWeek, passLevel, dayStart, addDays, emptyStats, taskProgress, mergeCoverage, coverageSeconds, confirmedDelta, type PassStats, type Range } from '../battlepass';

export type PassSeason = { id: string; title: string; status: 'draft' | 'published'; timezone: string; starts_at: number; ends_at: number; price: number; tasks: typeof PASS_TASKS; genres: string[]; published_at: number | null; finalized_at: number | null; expected_rewards?: Pick<PassReward, 'level' | 'track' | 'name' | 'kind' | 'plus_days'>[] };
type Tx = ReturnType<typeof db>;
type Member = { xp: number; premium: boolean; settled_at: number | null };
type Scope = { scope: string; stats: PassStats; genre: string | null; rerolled: boolean; genre_since: number };
export type PassReward = { season_id: string; level: number; track: 'free' | 'premium'; cosmetic_id: string; kind: 'pin' | 'tag' | 'frame' | 'background' | 'plus'; name: string; preview: string; slug: string; plus_days?: number; claimed?: boolean; available?: boolean };
export const rules = (season: PassSeason) => season.tasks.daily ? season.tasks : PASS_TASKS;
export async function findSeason(id?: string, drafts = false, tx: Tx = db()) {
  return tx.prepare(id
    ? `SELECT * FROM pass_seasons WHERE id=? ${drafts ? '' : "AND status='published'"}`
    : `SELECT * FROM pass_seasons WHERE status='published' ORDER BY CASE WHEN starts_at<=? AND ends_at>? THEN 0 WHEN starts_at>? THEN 1 ELSE 2 END,starts_at DESC LIMIT 1`)
    .bind(...(id ? [id] : [now(), now(), now()])).first<PassSeason>();
}
export function assertLive(s: PassSeason | null, time = now()): asserts s is PassSeason {
  if (!s || s.status !== 'published' || time < Number(s.starts_at) || time >= Number(s.ends_at)) throw new ApiError('Сезон сейчас недоступен для участия', 409);
}
export async function memberLock(tx: Tx, season: string, user: string) {
  await tx.prepare('INSERT INTO pass_members(season_id,user_id,joined_at) VALUES (?,?,?) ON CONFLICT DO NOTHING').bind(season, user, now()).run();
  return (await tx.prepare('SELECT xp,premium,settled_at FROM pass_members WHERE season_id=? AND user_id=? FOR UPDATE').bind(season, user).first<Member>())!;
}
export function defaultGenre(s: PassSeason, user: string, week: number) {
  let hash = week;
  for (const c of user) hash = ((hash * 31) + c.charCodeAt(0)) >>> 0;
  return s.genres[hash % s.genres.length] || null;
}
function newScope(s: PassSeason, user: string, scope: string): Scope {
  const week = Number(scope.split(':')[1]);
  return { scope, stats: emptyStats(), genre: scope.startsWith('week:') ? defaultGenre(s, user, week) : null, rerolled: false,
    genre_since: scope.startsWith('week:') ? dayStart(addDays(passDay(Number(s.starts_at), s.timezone), (week - 1) * 7), s.timezone) : Number(s.starts_at) };
}
async function loadScope(tx: Tx, s: PassSeason, user: string, scope: string) {
  const value = newScope(s, user, scope);
  await tx.prepare('INSERT INTO pass_scopes(season_id,user_id,scope,genre,genre_since) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING').bind(s.id, user, scope, value.genre, value.genre_since).run();
  return (await tx.prepare('SELECT scope,stats,genre,rerolled,genre_since FROM pass_scopes WHERE season_id=? AND user_id=? AND scope=?').bind(s.id, user, scope).first<Scope>())!;
}
async function evaluateScope(tx: Tx, s: PassSeason, user: string, scope: Scope) {
  const group = scope.scope.startsWith('day:') ? 'daily' : scope.scope.startsWith('week:') ? 'weekly' : 'seasonal';
  for (const task of rules(s)[group]) {
    if (taskProgress(scope.stats, task) + 0.000001 < task.target) continue;
    const added = await tx.prepare(`INSERT INTO pass_xp(season_id,user_id,key,amount,reason,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING RETURNING amount`)
      .bind(s.id, user, `${scope.scope}:${task.id}`, task.xp, task.title, now()).first<{ amount: number }>();
    if (added) await tx.prepare('UPDATE pass_members SET xp=xp+? WHERE season_id=? AND user_id=?').bind(added.amount, s.id, user).run();
  }
}
type Watch = { id: string; season_id: string; user_id: string; auth_hash: string; anime_id: number; episode: number; duration: number | null; genres: string[]; created_at: number; expires_at: number; seq: number; last_t: number | null; last_p: number | null };
export type WatchSample = { t: number; p: number };

// Input metadata here is resolved by the route from the site's catalog, never supplied by the player.
export async function startPassWatch(user: string, authHash: string, meta: { anime: number; episode: number; duration: number | null; genres: string[] }) {
  const s = await findSeason();
  if (!s || s.status !== 'published' || now() < Number(s.starts_at) || now() >= Number(s.ends_at)) return { token: null };
  return db().transaction(async (tx) => {
    await memberLock(tx, s.id, user);
    const count = await tx.prepare('SELECT count(*) AS n FROM pass_watch_sessions WHERE user_id=? AND created_at>?').bind(user, now() - 60000).first<{ n: number }>();
    if (Number(count?.n) >= 20) throw new ApiError('Слишком много сессий плеера', 429);
    const token = uid(), stamp = now();
    await tx.prepare('INSERT INTO pass_watch_clock(user_id) VALUES (?) ON CONFLICT DO NOTHING').bind(user).run();
    await tx.prepare(`INSERT INTO pass_watch_sessions(id,user_id,auth_hash,season_id,anime_id,episode,duration,genres,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?::text::jsonb,?,?)`)
      .bind(token, user, authHash, s.id, meta.anime, meta.episode, meta.duration, JSON.stringify(meta.genres), stamp, stamp + 4 * 3600000).run();
    return { token, durationKnown: !!meta.duration, expiresAt: stamp + 4 * 3600000 };
  });
}

type Coverage = { ranges: Range[]; completed: boolean };
async function recordSegment(tx: Tx, s: PassSeason, user: string, session: Watch, start: number, end: number, position: number, scopes: Map<string, Scope>, coverage: Map<string, Coverage>) {
  let cursor = start;
  while (cursor < end) {
    const day = passDay(cursor, s.timezone);
    const until = Math.min(end, dayStart(addDays(day, 1), s.timezone));
    const seconds = (until - cursor) / 1000;
    const week = Math.min(8, passWeek(cursor, Number(s.starts_at), s.timezone));
    const keys = [`day:${day}`, 'season', ...Array.from({ length: Math.max(0, week) }, (_, i) => `week:${i + 1}`)];
    for (const key of keys) {
      let scope = scopes.get(key);
      if (!scope) { scope = await loadScope(tx, s, user, key); scopes.set(key, scope); }
      const stats = scope.stats;
      stats.seconds += seconds;
      stats.days[day] = (stats.days[day] || 0) + seconds;
      stats.titles[session.anime_id] = (stats.titles[session.anime_id] || 0) + seconds;
      if (key.startsWith('week:') && scope.genre && session.genres.includes(scope.genre) && session.duration && until > Number(scope.genre_since)) {
        const after = Math.max(cursor, Number(scope.genre_since));
        let row = coverage.get(key);
        if (!row) {
          row = await tx.prepare('SELECT ranges,completed FROM pass_coverage WHERE season_id=? AND user_id=? AND scope=? AND anime_id=? AND episode=?')
            .bind(s.id, user, key, session.anime_id, session.episode).first<Coverage>() || { ranges: [], completed: false };
          coverage.set(key, row);
        }
        if (!row?.completed) {
          const last = position - (end - until) / 1000;
          const ranges = mergeCoverage(row?.ranges || [], [last - (until - after) / 1000, last], Number(session.duration));
          // Bound fragmented malicious streams without ever filling unseen gaps.
          if (ranges.length > 4096) continue;
          const completed = coverageSeconds(ranges) >= Number(session.duration) * .8;
          row.ranges = ranges; row.completed = completed;
          if (completed) stats.episodes++;
        }
      }
    }
    cursor = until;
  }
}
export async function recordPassWatch(user: string, authHash: string, token: string, seq: number, samples: WatchSample[]) {
  if (!Number.isInteger(seq) || seq < 1 || !Array.isArray(samples) || !samples.length || samples.length > 120 || samples.some((v) => !v || !Number.isFinite(v.t) || !Number.isFinite(v.p) || v.t < 0 || v.p < 0 || v.p > 86400)) throw new ApiError('Некорректные события плеера');
  return db().transaction(async (tx) => {
    // A single account clock serializes ALL players across devices and seasons.
    const clock = await tx.prepare('SELECT credited_until FROM pass_watch_clock WHERE user_id=? FOR UPDATE').bind(user).first<{ credited_until: number }>();
    const session = await tx.prepare('SELECT * FROM pass_watch_sessions WHERE id=? AND user_id=? AND auth_hash=? FOR UPDATE').bind(token, user, authHash).first<Watch>();
    const stamp = now();
    if (!clock || !session || Number(session.expires_at) <= stamp) throw new ApiError('Сессия просмотра истекла', 409, 'pass_session_expired');
    const s = await findSeason(session.season_id, false, tx);
    if (!s || stamp >= Number(s.ends_at)) return { accepted: false, ended: true };
    if (seq <= session.seq) return { accepted: true, duplicate: true };
    if (seq !== session.seq + 1) throw new ApiError('Нарушен порядок событий', 409, 'pass_sequence');
    if (samples.at(-1)!.t > stamp - Number(session.created_at) + 2000 || samples.at(-1)!.t > 4 * 3600000) throw new ApiError('События опережают серверное время');
    const member = await memberLock(tx, s.id, user);
    const scopes = new Map<string, Scope>();
    const coverage = new Map<string, Coverage>();
    let previous = session.last_t === null ? null : { t: Number(session.last_t), p: Number(session.last_p) };
    let floor = Number(clock.credited_until), credited = 0;
    for (const sample of samples) {
      if (previous && sample.t <= previous.t) throw new ApiError('События должны идти по порядку');
      const delta = previous ? confirmedDelta(previous, sample) : 0;
      if (delta > 0 && (!session.duration || sample.p <= Number(session.duration) + 2)) {
        const end = Math.min(Number(session.created_at) + sample.t, stamp, Number(s.ends_at));
        const start = Math.max(Number(session.created_at) + sample.t - delta * 1000, floor, Number(s.starts_at));
        if (end > start) {
          await recordSegment(tx, s, user, session, start, end, sample.p - Math.max(0, Number(session.created_at) + sample.t - end) / 1000, scopes, coverage);
          credited += (end - start) / 1000;
          floor = end;
        }
      }
      previous = sample;
    }
    for (const scope of scopes.values()) {
      await tx.prepare('UPDATE pass_scopes SET stats=?::text::jsonb WHERE season_id=? AND user_id=? AND scope=?').bind(JSON.stringify(scope.stats), s.id, user, scope.scope).run();
      await evaluateScope(tx, s, user, scope);
    }
    for (const [key, row] of coverage) await tx.prepare(`INSERT INTO pass_coverage(season_id,user_id,scope,anime_id,episode,ranges,completed) VALUES (?,?,?,?,?,?::text::jsonb,?)
      ON CONFLICT(season_id,user_id,scope,anime_id,episode) DO UPDATE SET ranges=excluded.ranges,completed=excluded.completed`)
      .bind(s.id, user, key, session.anime_id, session.episode, JSON.stringify(row.ranges), row.completed).run();
    await tx.prepare('UPDATE pass_watch_clock SET credited_until=? WHERE user_id=?').bind(Math.ceil(floor), user).run();
    await tx.prepare('UPDATE pass_watch_sessions SET seq=?,last_t=?,last_p=? WHERE id=?').bind(seq, previous!.t, previous!.p, token).run();
    return { accepted: true, seconds: credited, previousXp: member.xp };
  });
}
export async function claimInTransaction(tx: Tx, s: PassSeason, user: string, member: Member, claimedRewards?: PassReward[]) {
  if (s.status !== 'published' || now() < Number(s.starts_at)) throw new ApiError('Сезон ещё не начался', 409);
  const rewards = await tx.prepare(`SELECT r.* FROM pass_rewards r WHERE r.season_id=? AND r.level<=? AND (r.track='free' OR ?) ORDER BY r.level,r.track,r.cosmetic_id`)
    .bind(s.id, passLevel(Number(member.xp)), member.premium).all<PassReward>();
  let count = 0;
  for (const reward of rewards.results) {
    const saved = await tx.prepare(`INSERT INTO pass_claims(season_id,user_id,level,track,cosmetic_id,claimed_at) VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING RETURNING cosmetic_id`)
      .bind(s.id, user, reward.level, reward.track, reward.cosmetic_id, now()).first();
    if (!saved) continue;
    if (reward.kind === 'plus') {
      await grantPlusDays(user, Number(reward.plus_days), `pass:${s.id}:${user}:${reward.level}:${reward.track}:${reward.cosmetic_id}`, `AniMonster Pass: ${s.title}, уровень ${reward.level}`, tx);
      count++;
      claimedRewards?.push(reward);
      continue;
    }
    await tx.prepare(`INSERT INTO user_cosmetics(user_id,cosmetic_id,unlocked_at,source,source_key,metadata) VALUES (?,?,?,'battlepass',?,?::text::jsonb) ON CONFLICT(user_id,cosmetic_id) DO NOTHING`)
      .bind(user, reward.cosmetic_id, now(), `${s.id}:${reward.level}:${reward.track}:${reward.cosmetic_id}`, JSON.stringify({ season: s.id, level: reward.level, track: reward.track })).run();
    count++;
    claimedRewards?.push(reward);
  }
  return count;
}
export async function claimPass(user: string, seasonId: string) {
  const s = await findSeason(seasonId);
  if (!s || now() < Number(s.starts_at)) throw new ApiError('Сезон ещё не начался', 409);
  return db().transaction(async (tx) => {
    const rewards: PassReward[] = [];
    const count = await claimInTransaction(tx, s, user, await memberLock(tx, s.id, user), rewards);
    return { count, rewards };
  });
}
export async function rerollPassGenre(user: string, seasonId: string, week: number) {
  const s = await findSeason(seasonId); assertLive(s);
  if (!Number.isInteger(week) || week < 1 || week > Math.min(8, passWeek(now(), Number(s.starts_at), s.timezone))) throw new ApiError('Неделя ещё не открылась');
  const available = await eligiblePassGenres();
  return db().transaction(async (tx) => {
    await memberLock(tx, s.id, user);
    const key = `week:${week}`, scope = await loadScope(tx, s, user, key);
    const awarded = await tx.prepare('SELECT 1 FROM pass_xp WHERE season_id=? AND user_id=? AND key=?').bind(s.id, user, `${key}:genre3`).first();
    if (scope.rerolled || awarded) throw new ApiError('Замена уже использована или задание выполнено', 409);
    const genre = s.genres.find((g) => g !== scope.genre && available.some((v) => v.genre === g));
    if (!genre) throw new ApiError('Сейчас нет другого жанра с достаточным контентом', 409);
    scope.stats.episodes = 0;
    await tx.prepare('DELETE FROM pass_coverage WHERE season_id=? AND user_id=? AND scope=?').bind(s.id, user, key).run();
    await tx.prepare('UPDATE pass_scopes SET genre=?,rerolled=true,genre_since=?,stats=?::text::jsonb WHERE season_id=? AND user_id=? AND scope=?').bind(genre, now(), JSON.stringify(scope.stats), s.id, user, key).run();
    return { genre };
  });
}
export async function eligiblePassGenres() {
  // Only episodes with catalog duration can satisfy the 80% rule. No estimated 24-minute episodes.
  return (await db().prepare(`SELECT genre,count(DISTINCT a.id) AS titles,count(*) AS episodes FROM anime_cache a
    CROSS JOIN LATERAL jsonb_array_elements_text(a.genres_index) AS genre
    CROSS JOIN LATERAL jsonb_array_elements(a.episodes::jsonb) AS ep
    WHERE (ep->>'duration')::numeric BETWEEN 60 AND 86400
      AND EXISTS(SELECT 1 FROM anime_sources src WHERE src.anime_id=a.id AND src.active=1)
    GROUP BY genre HAVING count(*)>=3 ORDER BY genre`).all<{ genre: string; titles: number; episodes: number }>()).results;
}
export async function passOverview(user?: string, seasonId?: string, drafts = false) {
  const s = await findSeason(seasonId, drafts);
  const history = user ? (await db().prepare(`SELECT s.id,s.title,s.starts_at,s.ends_at,m.xp,m.premium FROM pass_members m JOIN pass_seasons s ON s.id=m.season_id WHERE m.user_id=? ORDER BY s.starts_at DESC`).bind(user).all()).results : [];
  if (!s) return { season: null, history };
  const [member, rewards, saved, earned] = await Promise.all([
    user ? db().prepare('SELECT xp,premium,settled_at FROM pass_members WHERE season_id=? AND user_id=?').bind(s.id, user).first<Member>() : null,
    db().prepare(`SELECT r.*,c.slug,EXISTS(SELECT 1 FROM pass_claims x WHERE x.season_id=r.season_id AND x.level=r.level AND x.track=r.track AND x.cosmetic_id=r.cosmetic_id AND x.user_id=?) AS claimed FROM pass_rewards r LEFT JOIN cosmetics c ON c.id=r.cosmetic_id WHERE r.season_id=? ORDER BY r.level,r.track,c.sort_order`).bind(user || '', s.id).all<PassReward>(),
    user ? db().prepare('SELECT scope,stats,genre,rerolled,genre_since FROM pass_scopes WHERE season_id=? AND user_id=?').bind(s.id, user).all<Scope>() : { results: [] },
    user ? db().prepare('SELECT key FROM pass_xp WHERE season_id=? AND user_id=?').bind(s.id, user).all<{ key: string }>() : { results: [] },
  ]);
  const time = now(), day = passDay(Math.min(time, Number(s.ends_at || time) - 1), s.timezone);
  const weeks = s.starts_at && time >= Number(s.starts_at) ? Math.min(8, passWeek(Math.min(time, Number(s.ends_at) - 1), Number(s.starts_at), s.timezone)) : 0;
  const tasks = [`day:${day}`, ...Array.from({ length: weeks }, (_, i) => `week:${i + 1}`), 'season'].map((key) => {
    const scope = saved.results.find((v) => v.scope === key) || (s.starts_at ? newScope(s, user || '', key) : { scope: key, stats: emptyStats(), genre: null, rerolled: false });
    const group = key.startsWith('day:') ? 'daily' : key.startsWith('week:') ? 'weekly' : 'seasonal';
    return { ...scope, group, endsAt: group === 'daily' ? Math.min(dayStart(addDays(day, 1), s.timezone), Number(s.ends_at || 0)) : s.ends_at,
      tasks: rules(s)[group].map((task) => ({ ...task, progress: Math.min(task.target, taskProgress(scope.stats, task)), completed: earned.results.some((e) => e.key === `${key}:${task.id}`) })) };
  });
  const xp = Number(member?.xp || 0), level = passLevel(xp);
  return { season: s, history, xp, level, premium: !!member?.premium, nextXp: level === 40 ? 0 : 400 - xp % 400,
    rewards: rewards.results.map((r) => ({ ...r, available: s.status === 'published' && time >= Number(s.starts_at) && !!user && Number(r.level) <= level && (r.track === 'free' || !!member?.premium) })), tasks,
    serverTime: time, active: s.status === 'published' && time >= Number(s.starts_at) && time < Number(s.ends_at), ended: !!s.ends_at && time >= Number(s.ends_at) };
}
export async function settlePasses(limit = 50) {
  const due = await db().prepare(`SELECT m.season_id,m.user_id FROM pass_members m JOIN pass_seasons s ON s.id=m.season_id WHERE s.status='published' AND s.ends_at<=? AND m.settled_at IS NULL ORDER BY s.ends_at,m.user_id LIMIT ?`).bind(now(), Math.min(100, limit)).all<{ season_id: string; user_id: string }>();
  for (const item of due.results) await db().transaction(async (tx) => {
    const s = (await findSeason(item.season_id, false, tx))!;
    const member = await memberLock(tx, s.id, item.user_id);
    if (member.settled_at) return;
    await claimInTransaction(tx, s, item.user_id, member);
    await tx.prepare('UPDATE pass_members SET settled_at=? WHERE season_id=? AND user_id=?').bind(now(), s.id, item.user_id).run();
  });
  await db().prepare(`UPDATE pass_seasons s SET finalized_at=? WHERE status='published' AND ends_at<=? AND finalized_at IS NULL AND NOT EXISTS(SELECT 1 FROM pass_members m WHERE m.season_id=s.id AND m.settled_at IS NULL)`).bind(now(), now()).run();
  await db().prepare('DELETE FROM pass_watch_sessions WHERE expires_at<?').bind(now()).run();
  return { settled: due.results.length };
}
