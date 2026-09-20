import {
  ApiError,
  db,
  now,
  premium,
  publicUser,
  runtime,
  uid,
  type User,
} from './core';
import { getAnime } from './library';
import { animeRelations } from './anime-relations';

export const PARTY_CAPACITY = 10;
export const FREE_WEEKLY_EPISODES = 10;
export const PARTY_EPISODE_SECONDS = 5 * 60;
const PARTY_LIFETIME = 12 * 60 * 60 * 1000;
const EMPTY_LIFETIME = 30 * 60 * 1000;
const PRESENCE_WINDOW = 45 * 1000;
const HOST_GRACE = 2 * 60 * 1000;

export type PartyRow = {
  id: string;
  code: string;
  host_user_id: string;
  anime_id: number;
  anime_title: string;
  release_id: number | null;
  episode: number;
  provider: 'aniliberty' | 'kodik';
  voiceover: string;
  position_ms: number;
  playing: number;
  state_version: number;
  state_updated_at: number;
  host_missing_since: number | null;
  next_episode: number | null;
  next_episode_at: number | null;
  status: 'active' | 'ended';
  created_at: number;
  expires_at: number;
  empty_since: number | null;
  ended_at: number | null;
};

type MemberRow = {
  user_id: string;
  role: 'host' | 'member';
  joined_at: number;
  last_seen_at: number;
  chat_muted: number;
  nick: string;
  avatar: string;
  theme: string;
  premium_until?: number;
};

export function watchPartiesEnabled() {
  return (
    runtime().WATCH_PARTIES_ENABLED === 'true' ||
    process.env.NODE_ENV !== 'production'
  );
}

export function requireWatchParties() {
  if (!watchPartiesEnabled())
    throw new ApiError(
      'Совместный просмотр пока недоступен',
      503,
      'watch_parties_disabled',
    );
}

export function moscowWeek(timestamp = now()) {
  const shifted = new Date(timestamp + 3 * 60 * 60 * 1000);
  const weekday = shifted.getUTCDay() || 7;
  shifted.setUTCDate(shifted.getUTCDate() - weekday + 1);
  shifted.setUTCHours(0, 0, 0, 0);
  const weekStart = shifted.toISOString().slice(0, 10);
  const resetAt = shifted.getTime() - 3 * 60 * 60 * 1000 + 7 * 86400000;
  return { weekStart, resetAt };
}

function code() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join(
    '',
  );
}

async function event(
  partyId: string,
  type: string,
  payload: unknown = {},
  actorId?: string,
) {
  await db()
    .prepare(
      'INSERT INTO watch_party_events(party_id,event_type,payload,actor_id,created_at) VALUES (?,?,?,?,?)',
    )
    .bind(partyId, type, JSON.stringify(payload), actorId || null, now())
    .run();
}

function canonicalPosition(party: PartyRow, timestamp = now()) {
  return Math.max(
    0,
    Math.floor(
      Number(party.position_ms) +
        (party.playing
          ? Math.max(0, timestamp - Number(party.state_updated_at))
          : 0),
    ),
  );
}

async function rawParty(codeValue: string) {
  return db()
    .prepare('SELECT * FROM watch_parties WHERE code=?')
    .bind(codeValue.toUpperCase())
    .first<PartyRow>();
}

async function endParty(party: PartyRow, reason: string) {
  if (party.status === 'ended') return party;
  const timestamp = now();
  await db().batch([
    db()
      .prepare(
        "UPDATE watch_parties SET status='ended',playing=0,position_ms=?,state_version=state_version+1,state_updated_at=?,ended_at=? WHERE id=? AND status='active'",
      )
      .bind(
        canonicalPosition(party, timestamp),
        timestamp,
        timestamp,
        party.id,
      ),
    db()
      .prepare('DELETE FROM watch_party_active_users WHERE party_id=?')
      .bind(party.id),
  ]);
  await event(party.id, 'party_ended', { reason });
  return (await rawParty(party.code))!;
}

export async function maintainParty(codeValue: string) {
  let party = await rawParty(codeValue);
  if (!party) throw new ApiError('Комната не найдена', 404, 'party_not_found');
  if (party.status === 'ended') return party;
  const timestamp = now();
  if (party.expires_at <= timestamp) return endParty(party, 'expired');
  if (
    party.next_episode &&
    party.next_episode_at &&
    party.next_episode_at <= timestamp
  ) {
    await db()
      .prepare(
        'UPDATE watch_parties SET episode=?,position_ms=0,playing=1,next_episode=NULL,next_episode_at=NULL,state_version=state_version+1,state_updated_at=? WHERE id=? AND next_episode_at<=?',
      )
      .bind(party.next_episode, timestamp, party.id, timestamp)
      .run();
    await event(party.id, 'autonext_completed', {
      episode: party.next_episode,
    });
    party = (await rawParty(codeValue))!;
  }

  const active = (
    await db()
      .prepare(
        `SELECT user_id,joined_at FROM watch_party_members
         WHERE party_id=? AND left_at IS NULL AND kicked_at IS NULL AND last_seen_at>? ORDER BY joined_at`,
      )
      .bind(party.id, timestamp - PRESENCE_WINDOW)
      .all<{ user_id: string; joined_at: number }>()
  ).results;
  if (!active.length) {
    if (!party.empty_since)
      await db()
        .prepare('UPDATE watch_parties SET empty_since=? WHERE id=?')
        .bind(timestamp, party.id)
        .run();
    else if (party.empty_since <= timestamp - EMPTY_LIFETIME)
      return endParty(party, 'empty');
    return (await rawParty(codeValue))!;
  }
  if (party.empty_since)
    await db()
      .prepare('UPDATE watch_parties SET empty_since=NULL WHERE id=?')
      .bind(party.id)
      .run();

  const hostPresent = active.some(
    (member) => member.user_id === party!.host_user_id,
  );
  if (hostPresent && party.host_missing_since) {
    await db()
      .prepare('UPDATE watch_parties SET host_missing_since=NULL WHERE id=?')
      .bind(party.id)
      .run();
  } else if (!hostPresent && !party.host_missing_since) {
    await db()
      .prepare(
        'UPDATE watch_parties SET host_missing_since=?,position_ms=?,playing=0,state_version=state_version+1,state_updated_at=? WHERE id=?',
      )
      .bind(timestamp, canonicalPosition(party, timestamp), timestamp, party.id)
      .run();
    await event(party.id, 'host_missing', {
      transfer_at: timestamp + HOST_GRACE,
    });
  } else if (
    !hostPresent &&
    party.host_missing_since &&
    party.host_missing_since <= timestamp - HOST_GRACE
  ) {
    const successor = active[0];
    await db().batch([
      db()
        .prepare(
          "UPDATE watch_party_members SET role='member' WHERE party_id=?",
        )
        .bind(party.id),
      db()
        .prepare(
          "UPDATE watch_party_members SET role='host' WHERE party_id=? AND user_id=?",
        )
        .bind(party.id, successor.user_id),
      db()
        .prepare(
          'UPDATE watch_parties SET host_user_id=?,host_missing_since=NULL,state_version=state_version+1,state_updated_at=? WHERE id=?',
        )
        .bind(successor.user_id, timestamp, party.id),
    ]);
    await event(party.id, 'host_transferred', { user_id: successor.user_id });
  }
  party = (await rawParty(codeValue))!;
  return party;
}

async function member(partyId: string, userId: string) {
  return db()
    .prepare(
      `SELECT m.*,u.nick,u.avatar,u.theme FROM watch_party_members m
       JOIN users u ON u.id=m.user_id
       WHERE m.party_id=? AND m.user_id=? AND m.left_at IS NULL AND m.kicked_at IS NULL`,
    )
    .bind(partyId, userId)
    .first<MemberRow>();
}

export async function requirePartyMember(codeValue: string, user: User) {
  const party = await maintainParty(codeValue);
  if (party.status !== 'active')
    throw new ApiError('Комната уже завершена', 410, 'party_ended');
  const membership = await member(party.id, user.id);
  if (!membership)
    throw new ApiError(
      'Сначала войдите в комнату',
      403,
      'party_membership_required',
    );
  return { party, membership };
}

async function quota(userId: string, animeId: number, episode: number) {
  const { weekStart, resetAt } = moscowWeek();
  const [premiumUntil, row, usage] = await Promise.all([
    premium(userId),
    db()
      .prepare(
        'SELECT used FROM watch_party_weekly_quotas WHERE user_id=? AND week_start=?',
      )
      .bind(userId, weekStart)
      .first<{ used: number }>(),
    db()
      .prepare(
        'SELECT charged_at,watched_seconds FROM watch_party_episode_usage WHERE user_id=? AND week_start=? AND anime_id=? AND episode=?',
      )
      .bind(userId, weekStart, animeId, episode)
      .first<{ charged_at: number | null; watched_seconds: number }>(),
  ]);
  const used = Number(row?.used || 0);
  return {
    plus: premiumUntil > now(),
    used,
    remaining:
      premiumUntil > now() ? null : Math.max(0, FREE_WEEKLY_EPISODES - used),
    reset_at: resetAt,
    charged: !!usage?.charged_at,
    watched_seconds: Number(usage?.watched_seconds || 0),
    allowed:
      premiumUntil > now() ||
      !!usage?.charged_at ||
      used < FREE_WEEKLY_EPISODES,
  };
}

async function contentAccess(user: User, animeId: number, episode: number) {
  const cached = await getAnime(animeId);
  if (!cached) throw new ApiError('Тайтл не найден', 404, 'anime_not_found');
  if (cached.anime.is_adult && !user.adult_confirmed_at)
    throw new ApiError(
      'Сначала подтвердите совершеннолетие',
      403,
      'adult_confirmation_required',
    );
  const availability = await db()
    .prepare(
      'SELECT free_at FROM anime_episode_availability WHERE anime_id=? AND episode=?',
    )
    .bind(animeId, episode)
    .first<{ free_at: number }>();
  if (
    availability?.free_at &&
    availability.free_at > now() &&
    !(await premium(user.id))
  )
    throw new ApiError(
      'Эта серия пока доступна только с Plus',
      403,
      'plus_episode_locked',
    );
  return cached;
}

export async function createParty(
  user: User,
  input: {
    anime_id: number;
    episode: number;
    voiceover?: string;
    provider?: string;
    release_id?: number;
  },
) {
  requireWatchParties();
  const animeId = Number(input.anime_id);
  const episode = Number(input.episode);
  if (
    !Number.isInteger(animeId) ||
    animeId < 1 ||
    !Number.isInteger(episode) ||
    episode < 1
  )
    throw new ApiError('Некорректный тайтл или серия');
  const cached = await contentAccess(user, animeId, episode);
  const timestamp = now();
  const partyId = uid();
  const partyCode = code();
  const provider = input.provider === 'kodik' ? 'kodik' : 'aniliberty';
  await db().batch([
    db()
      .prepare(
        'UPDATE watch_party_members SET left_at=? WHERE user_id=? AND left_at IS NULL AND kicked_at IS NULL',
      )
      .bind(timestamp, user.id),
    db()
      .prepare('DELETE FROM watch_party_active_users WHERE user_id=?')
      .bind(user.id),
    db()
      .prepare(
        `INSERT INTO watch_parties(id,code,host_user_id,anime_id,anime_title,release_id,episode,provider,voiceover,position_ms,playing,state_updated_at,created_at,expires_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?,?)`,
      )
      .bind(
        partyId,
        partyCode,
        user.id,
        animeId,
        cached.anime.russian || cached.anime.name,
        Number(input.release_id || cached.anime.release_id) || null,
        episode,
        provider,
        String(input.voiceover || provider).slice(0, 120),
        0,
        timestamp,
        timestamp,
        timestamp + PARTY_LIFETIME,
      ),
    db()
      .prepare(
        "INSERT INTO watch_party_members(party_id,user_id,role,joined_at,last_seen_at) VALUES (?,?,'host',?,?)",
      )
      .bind(partyId, user.id, timestamp, timestamp),
    db()
      .prepare(
        'INSERT INTO watch_party_active_users(user_id,party_id,updated_at) VALUES (?,?,?)',
      )
      .bind(user.id, partyId, timestamp),
  ]);
  await event(
    partyId,
    'party_created',
    { anime_id: animeId, episode },
    user.id,
  );
  return { code: partyCode };
}

export async function joinParty(codeValue: string, user: User) {
  requireWatchParties();
  const party = await maintainParty(codeValue);
  if (party.status !== 'active')
    throw new ApiError('Комната уже завершена', 410, 'party_ended');
  if (
    await db()
      .prepare(
        'SELECT 1 AS banned FROM watch_party_bans WHERE party_id=? AND user_id=?',
      )
      .bind(party.id, user.id)
      .first()
  )
    throw new ApiError(
      'Ведущий закрыл вам доступ к этой комнате',
      403,
      'party_banned',
    );
  const existing = await member(party.id, user.id);
  if (!existing) {
    const count = await db()
      .prepare(
        'SELECT count(*) AS count FROM watch_party_members WHERE party_id=? AND left_at IS NULL AND kicked_at IS NULL AND last_seen_at>?',
      )
      .bind(party.id, now() - HOST_GRACE)
      .first<{ count: number }>();
    if (Number(count?.count || 0) >= PARTY_CAPACITY)
      throw new ApiError('В комнате уже 10 участников', 409, 'party_full');
  }
  await contentAccess(user, party.anime_id, party.episode);
  const timestamp = now();
  await db().batch([
    db()
      .prepare(
        'UPDATE watch_party_members SET left_at=? WHERE user_id=? AND party_id<>? AND left_at IS NULL AND kicked_at IS NULL',
      )
      .bind(timestamp, user.id, party.id),
    db()
      .prepare('DELETE FROM watch_party_active_users WHERE user_id=?')
      .bind(user.id),
    db()
      .prepare(
        `INSERT INTO watch_party_members(party_id,user_id,role,joined_at,last_seen_at,left_at,kicked_at)
         VALUES (?,?,'member',?,?,NULL,NULL)
         ON CONFLICT(party_id,user_id) DO UPDATE SET last_seen_at=excluded.last_seen_at,left_at=NULL,kicked_at=NULL`,
      )
      .bind(party.id, user.id, timestamp, timestamp),
    db()
      .prepare(
        'INSERT INTO watch_party_active_users(user_id,party_id,updated_at) VALUES (?,?,?)',
      )
      .bind(user.id, party.id, timestamp),
  ]);
  await event(
    party.id,
    existing ? 'member_returned' : 'member_joined',
    { user_id: user.id },
    user.id,
  );
  return partySnapshot(codeValue, user);
}

export async function heartbeatParty(codeValue: string, user: User) {
  const { party } = await requirePartyMember(codeValue, user);
  const timestamp = now();
  await db().batch([
    db()
      .prepare(
        'UPDATE watch_party_members SET last_seen_at=? WHERE party_id=? AND user_id=?',
      )
      .bind(timestamp, party.id, user.id),
    db()
      .prepare(
        'UPDATE watch_party_active_users SET updated_at=? WHERE user_id=? AND party_id=?',
      )
      .bind(timestamp, user.id, party.id),
  ]);
  return { ok: true };
}

export async function leaveParty(codeValue: string, user: User) {
  const { party } = await requirePartyMember(codeValue, user);
  const timestamp = now();
  await db().batch([
    db()
      .prepare(
        'UPDATE watch_party_members SET left_at=? WHERE party_id=? AND user_id=?',
      )
      .bind(timestamp, party.id, user.id),
    db()
      .prepare('DELETE FROM watch_party_active_users WHERE user_id=?')
      .bind(user.id),
  ]);
  await event(party.id, 'member_left', { user_id: user.id }, user.id);
  return { ok: true };
}

export async function activeParty(userId: string) {
  const row = await db()
    .prepare(
      `SELECT p.code,p.anime_id,p.anime_title,p.episode,p.host_user_id,p.expires_at
       FROM watch_party_active_users a JOIN watch_parties p ON p.id=a.party_id
       WHERE a.user_id=? AND p.status='active' AND p.expires_at>?`,
    )
    .bind(userId, now())
    .first();
  return row || null;
}

export async function partySnapshot(codeValue: string, user: User) {
  const { party, membership } = await requirePartyMember(codeValue, user);
  const timestamp = now();
  const members = (
    await db()
      .prepare(
        `SELECT m.user_id,m.role,m.joined_at,m.last_seen_at,m.chat_muted,u.nick,u.avatar,u.theme
         FROM watch_party_members m JOIN users u ON u.id=m.user_id
         WHERE m.party_id=? AND m.left_at IS NULL AND m.kicked_at IS NULL
         ORDER BY CASE WHEN m.role='host' THEN 0 ELSE 1 END,m.joined_at`,
      )
      .bind(party.id)
      .all<MemberRow>()
  ).results.map((item) => ({
    ...item,
    online: item.last_seen_at > timestamp - PRESENCE_WINDOW,
  }));
  const messages =
    party.status === 'active'
      ? (
          await db()
            .prepare(
              `SELECT m.id,m.author_id,m.body,m.created_at,m.deleted_at,u.nick
             FROM watch_party_messages m JOIN users u ON u.id=m.author_id
             WHERE m.party_id=? ORDER BY m.created_at DESC LIMIT 100`,
            )
            .bind(party.id)
            .all()
        ).results.reverse()
      : [];
  const access = await quota(user.id, party.anime_id, party.episode);
  let accessError: { error: string; code: string } | null = null;
  try {
    await contentAccess(user, party.anime_id, party.episode);
  } catch (reason) {
    const error = reason as ApiError;
    accessError = { error: error.message, code: error.code };
  }
  return {
    party: {
      ...party,
      position_ms: canonicalPosition(party, timestamp),
      approximate_sync: party.provider === 'kodik',
    },
    me: { ...membership, host: party.host_user_id === user.id },
    user: await publicUser(user),
    members,
    messages,
    quota: access,
    playback_allowed: access.allowed && !accessError,
    playback_error: access.allowed
      ? accessError
      : {
          error: 'Недельный лимит совместного просмотра исчерпан',
          code: 'party_quota_exhausted',
        },
  };
}

async function canSwitchAnime(currentAnimeId: number, nextAnimeId: number) {
  if (currentAnimeId === nextAnimeId) return true;
  const relations = await animeRelations(currentAnimeId);
  return [...relations.mainline, ...relations.branches].some(
    (card) => card.item.id === nextAnimeId,
  );
}

export async function commandParty(
  codeValue: string,
  user: User,
  input: Record<string, unknown>,
) {
  const { party } = await requirePartyMember(codeValue, user);
  if (party.host_user_id !== user.id)
    throw new ApiError(
      'Управлять просмотром может только ведущий',
      403,
      'host_required',
    );
  if (Number(input.version) !== party.state_version)
    throw new ApiError(
      'Состояние комнаты уже изменилось',
      409,
      'stale_party_state',
    );
  const action = String(input.command || '');
  const timestamp = now();
  if (action === 'schedule_next' || action === 'cancel_next') {
    const nextEpisode = Number(input.episode);
    if (
      action === 'schedule_next' &&
      (!Number.isInteger(nextEpisode) || nextEpisode <= party.episode)
    )
      throw new ApiError('Следующая серия недоступна');
    const position = canonicalPosition(party, timestamp);
    const result = await db()
      .prepare(
        `UPDATE watch_parties SET position_ms=?,playing=0,next_episode=?,next_episode_at=?,state_version=state_version+1,state_updated_at=?
         WHERE id=? AND state_version=? RETURNING state_version`,
      )
      .bind(
        position,
        action === 'schedule_next' ? nextEpisode : null,
        action === 'schedule_next' ? timestamp + 10_000 : null,
        timestamp,
        party.id,
        party.state_version,
      )
      .first<{ state_version: number }>();
    if (!result)
      throw new ApiError(
        'Состояние комнаты уже изменилось',
        409,
        'stale_party_state',
      );
    await event(
      party.id,
      action === 'schedule_next' ? 'autonext_started' : 'autonext_cancelled',
      action === 'schedule_next'
        ? { episode: nextEpisode, starts_at: timestamp + 10_000 }
        : {},
      user.id,
    );
    return partySnapshot(codeValue, user);
  }
  let animeId = party.anime_id;
  let animeTitle = party.anime_title;
  let releaseId = party.release_id;
  let episode = party.episode;
  let provider = party.provider;
  let voiceover = party.voiceover;
  let position = canonicalPosition(party, timestamp);
  let playing = !!party.playing;

  if (action === 'play') playing = true;
  else if (action === 'pause') playing = false;
  else if (action === 'seek')
    position = Math.max(
      0,
      Math.min(24 * 60 * 60 * 1000, Number(input.position_ms) || 0),
    );
  else if (action === 'change_media') {
    const nextAnime = Number(input.anime_id || party.anime_id);
    const nextEpisode = Number(input.episode);
    if (
      !Number.isInteger(nextEpisode) ||
      nextEpisode < 1 ||
      !(await canSwitchAnime(party.anime_id, nextAnime))
    )
      throw new ApiError(
        'Нельзя открыть этот тайтл или серию в текущей комнате',
      );
    const cached = await contentAccess(user, nextAnime, nextEpisode);
    animeId = nextAnime;
    animeTitle = cached.anime.russian || cached.anime.name;
    releaseId = Number(input.release_id || cached.anime.release_id) || null;
    episode = nextEpisode;
    provider = input.provider === 'kodik' ? 'kodik' : 'aniliberty';
    voiceover = String(input.voiceover || provider).slice(0, 120);
    position = 0;
    playing = false;
  } else throw new ApiError('Неизвестная команда');

  if (action === 'play' || action === 'change_media')
    await contentAccess(user, animeId, episode);
  const result = await db()
    .prepare(
      `UPDATE watch_parties SET anime_id=?,anime_title=?,release_id=?,episode=?,provider=?,voiceover=?,position_ms=?,playing=?,next_episode=NULL,next_episode_at=NULL,state_version=state_version+1,state_updated_at=?
       WHERE id=? AND state_version=? RETURNING state_version`,
    )
    .bind(
      animeId,
      animeTitle,
      releaseId,
      episode,
      provider,
      voiceover,
      Math.floor(position),
      playing ? 1 : 0,
      timestamp,
      party.id,
      party.state_version,
    )
    .first<{ state_version: number }>();
  if (!result)
    throw new ApiError(
      'Состояние комнаты уже изменилось',
      409,
      'stale_party_state',
    );
  await event(
    party.id,
    'playback',
    { command: action, state_version: result.state_version },
    user.id,
  );
  return partySnapshot(codeValue, user);
}

export async function recordPartyProgress(
  codeValue: string,
  user: User,
  secondsValue: unknown,
) {
  const { party } = await requirePartyMember(codeValue, user);
  const seconds = Math.max(
    0,
    Math.min(30, Math.floor(Number(secondsValue) || 0)),
  );
  const access = await quota(user.id, party.anime_id, party.episode);
  if (access.plus || seconds < 1) return { ...access, allowed: true };
  const timestamp = now();
  const { weekStart } = moscowWeek(timestamp);
  await db().batch([
    db()
      .prepare(
        'INSERT INTO watch_party_weekly_quotas(user_id,week_start,used,updated_at) VALUES (?,?,0,?) ON CONFLICT(user_id,week_start) DO NOTHING',
      )
      .bind(user.id, weekStart, timestamp),
    db()
      .prepare(
        `INSERT INTO watch_party_episode_usage(user_id,week_start,anime_id,episode,watched_seconds,updated_at)
         VALUES (?,?,?,?,0,?) ON CONFLICT(user_id,week_start,anime_id,episode) DO NOTHING`,
      )
      .bind(user.id, weekStart, party.anime_id, party.episode, timestamp),
  ]);
  const row = await db()
    .prepare(
      `WITH current_usage AS (
         SELECT charged_at,watched_seconds FROM watch_party_episode_usage
         WHERE user_id=? AND week_start=? AND anime_id=? AND episode=? FOR UPDATE
       ), charged AS (
         UPDATE watch_party_weekly_quotas SET used=used+1,updated_at=?
         WHERE user_id=? AND week_start=? AND used<?
           AND EXISTS (SELECT 1 FROM current_usage WHERE charged_at IS NULL AND watched_seconds+?>=?)
         RETURNING used
       )
       UPDATE watch_party_episode_usage SET
         watched_seconds=LEAST(?,watched_seconds+?),
         charged_at=CASE WHEN charged_at IS NULL AND watched_seconds+?>=? AND EXISTS(SELECT 1 FROM charged) THEN ? ELSE charged_at END,
         updated_at=?
       WHERE user_id=? AND week_start=? AND anime_id=? AND episode=?
       RETURNING watched_seconds,charged_at`,
    )
    .bind(
      user.id,
      weekStart,
      party.anime_id,
      party.episode,
      timestamp,
      user.id,
      weekStart,
      FREE_WEEKLY_EPISODES,
      seconds,
      PARTY_EPISODE_SECONDS,
      PARTY_EPISODE_SECONDS,
      seconds,
      seconds,
      PARTY_EPISODE_SECONDS,
      timestamp,
      timestamp,
      user.id,
      weekStart,
      party.anime_id,
      party.episode,
    )
    .first<{ watched_seconds: number; charged_at: number | null }>();
  const next = await quota(user.id, party.anime_id, party.episode);
  const blocked =
    Number(row?.watched_seconds || 0) >= PARTY_EPISODE_SECONDS &&
    !row?.charged_at;
  if (blocked)
    await event(party.id, 'quota_denied', { user_id: user.id }, user.id);
  return { ...next, allowed: !blocked && next.allowed };
}

export async function sendPartyChat(
  codeValue: string,
  user: User,
  bodyValue: unknown,
) {
  const { party, membership } = await requirePartyMember(codeValue, user);
  if (membership.chat_muted)
    throw new ApiError('Ведущий отключил вам чат', 403, 'party_chat_muted');
  const body = String(bodyValue || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!body || body.length > 600)
    throw new ApiError('Сообщение должно содержать от 1 до 600 символов');
  const recent = await db()
    .prepare(
      'SELECT created_at FROM watch_party_messages WHERE party_id=? AND author_id=? ORDER BY created_at DESC LIMIT 1',
    )
    .bind(party.id, user.id)
    .first<{ created_at: number }>();
  if (recent && recent.created_at > now() - 1500)
    throw new ApiError(
      'Не отправляйте сообщения так часто',
      429,
      'rate_limited',
    );
  const id = uid();
  await db()
    .prepare(
      'INSERT INTO watch_party_messages(id,party_id,author_id,body,created_at) VALUES (?,?,?,?,?)',
    )
    .bind(id, party.id, user.id, body, now())
    .run();
  await event(party.id, 'chat', { id }, user.id);
  return { id };
}

const PARTY_REACTIONS = new Set(['❤️', '😂', '😮', '😢', '🔥', '👏']);
export async function sendPartyReaction(
  codeValue: string,
  user: User,
  reactionValue: unknown,
) {
  const { party } = await requirePartyMember(codeValue, user);
  const reaction = String(reactionValue || '');
  if (!PARTY_REACTIONS.has(reaction)) throw new ApiError('Неизвестная реакция');
  const recent = await db()
    .prepare(
      "SELECT created_at FROM watch_party_events WHERE party_id=? AND actor_id=? AND event_type='reaction' ORDER BY id DESC LIMIT 1",
    )
    .bind(party.id, user.id)
    .first<{ created_at: number }>();
  if (recent && recent.created_at > now() - 1000)
    throw new ApiError('Слишком много реакций', 429, 'rate_limited');
  await event(party.id, 'reaction', { reaction, nick: user.nick }, user.id);
  return { ok: true };
}

export async function moderateParty(
  codeValue: string,
  user: User,
  input: Record<string, unknown>,
) {
  const { party } = await requirePartyMember(codeValue, user);
  if (party.host_user_id !== user.id)
    throw new ApiError('Нужны права ведущего', 403, 'host_required');
  const action = String(input.action || '');
  if (action === 'delete_message') {
    await db()
      .prepare(
        'UPDATE watch_party_messages SET deleted_at=? WHERE id=? AND party_id=?',
      )
      .bind(now(), String(input.message_id || ''), party.id)
      .run();
  } else {
    const target = String(input.user_id || '');
    if (!target || target === user.id)
      throw new ApiError('Нельзя применить действие к ведущему');
    if (action === 'mute')
      await db()
        .prepare(
          'UPDATE watch_party_members SET chat_muted=? WHERE party_id=? AND user_id=?',
        )
        .bind(input.value === false ? 0 : 1, party.id, target)
        .run();
    else if (action === 'kick') {
      const timestamp = now();
      await db().batch([
        db()
          .prepare(
            'UPDATE watch_party_members SET kicked_at=?,left_at=? WHERE party_id=? AND user_id=?',
          )
          .bind(timestamp, timestamp, party.id, target),
        db()
          .prepare(
            'INSERT INTO watch_party_bans(party_id,user_id,created_by,created_at) VALUES (?,?,?,?) ON CONFLICT DO NOTHING',
          )
          .bind(party.id, target, user.id, timestamp),
        db()
          .prepare('DELETE FROM watch_party_active_users WHERE user_id=?')
          .bind(target),
      ]);
    } else if (action === 'unban')
      await db()
        .prepare('DELETE FROM watch_party_bans WHERE party_id=? AND user_id=?')
        .bind(party.id, target)
        .run();
    else throw new ApiError('Неизвестное действие модерации');
  }
  await event(
    party.id,
    'moderation',
    { action, user_id: input.user_id, message_id: input.message_id },
    user.id,
  );
  return { ok: true };
}

export async function reportPartyMessage(
  codeValue: string,
  user: User,
  messageId: unknown,
  reasonValue: unknown,
) {
  const { party } = await requirePartyMember(codeValue, user);
  const message = await db()
    .prepare('SELECT id FROM watch_party_messages WHERE id=? AND party_id=?')
    .bind(String(messageId || ''), party.id)
    .first();
  if (!message) throw new ApiError('Сообщение не найдено', 404);
  const reason = String(reasonValue || 'Нарушение правил')
    .trim()
    .slice(0, 300);
  await db()
    .prepare(
      'INSERT INTO watch_party_reports(id,party_id,message_id,reporter_id,reason,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(reporter_id,message_id) DO NOTHING',
    )
    .bind(uid(), party.id, String(messageId), user.id, reason, now())
    .run();
  return { ok: true };
}

export async function endPartyByHost(codeValue: string, user: User) {
  const { party } = await requirePartyMember(codeValue, user);
  if (party.host_user_id !== user.id)
    throw new ApiError(
      'Завершить комнату может только ведущий',
      403,
      'host_required',
    );
  await endParty(party, 'host');
  return { ok: true };
}

export async function partyEvents(
  codeValue: string,
  user: User,
  after: number,
) {
  const { party } = await requirePartyMember(codeValue, user);
  const rows = await db()
    .prepare(
      'SELECT id,event_type,payload,actor_id,created_at FROM watch_party_events WHERE party_id=? AND id>? ORDER BY id LIMIT 100',
    )
    .bind(party.id, Math.max(0, after))
    .all<{
      id: number;
      event_type: string;
      payload: string;
      actor_id: string | null;
      created_at: number;
    }>();
  return rows.results.map((row) => ({
    id: Number(row.id),
    type: row.event_type,
    payload: (() => {
      try {
        return JSON.parse(row.payload);
      } catch {
        return {};
      }
    })(),
    actor_id: row.actor_id,
    created_at: Number(row.created_at),
  }));
}

export async function watchPartyMetrics() {
  const row = await db()
    .prepare(
      `SELECT
       count(*) FILTER (WHERE status='active' AND expires_at>?) AS active_rooms,
       (SELECT count(*) FROM watch_party_members m JOIN watch_parties p ON p.id=m.party_id WHERE p.status='active' AND m.left_at IS NULL AND m.kicked_at IS NULL AND m.last_seen_at>?) AS active_members,
       (SELECT count(*) FROM watch_party_events WHERE event_type='quota_denied' AND created_at>?) AS quota_denials,
       (SELECT count(*) FROM watch_party_reports WHERE status='open') AS open_reports
       FROM watch_parties`,
    )
    .bind(now(), now() - PRESENCE_WINDOW, now() - 86400000)
    .first<Record<string, number>>();
  return Object.fromEntries(
    Object.entries(row || {}).map(([key, value]) => [key, Number(value || 0)]),
  );
}

export async function cleanupWatchParties() {
  const timestamp = now();
  const old = (
    await db()
      .prepare(
        "SELECT code FROM watch_parties WHERE status='active' AND (expires_at<? OR empty_since<?) LIMIT 100",
      )
      .bind(timestamp, timestamp - EMPTY_LIFETIME)
      .all<{ code: string }>()
  ).results;
  for (const item of old) await maintainParty(item.code);
  await db()
    .prepare(
      `DELETE FROM watch_party_messages WHERE party_id IN (
       SELECT id FROM watch_parties WHERE status='ended' AND ended_at<?
       )`,
    )
    .bind(timestamp - 30 * 86400000)
    .run();
  return { ended: old.length };
}
