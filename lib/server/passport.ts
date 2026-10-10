import { createHash } from 'node:crypto';
import { db, now, viewer, type User } from './core';
import { publicStreak } from './streak';
import { streakTimezone } from '@/lib/streak';
import { cosmeticsCatalog } from './cosmetics';
import type { Anime } from '@/lib/anime';
import { normalizePassportGenre, passportArchetype } from '@/lib/passport-metrics';

type Settings = { is_public: number; favorite_ids: number[]; award_ids: string[] };
type EpisodeRow = { anime_id: number; episode: number; qualified_at: number | null };
type TimeRow = { seconds: number | string | null };
type Award = { id: string; name: string; image: string | null; kind: 'achievement' | 'pin' };
export type Passport = {
  user: { id: string; nick: string; avatar: string; tag: string | null; pin: string | null; created_at: number; number: string; streak: number; longest_streak: number };
  own: boolean;
  public: boolean;
  episodes: number;
  anime_count: number;
  watch_seconds: number | null;
  completed_anime: number | null;
  longest_anime: { id: number; title: string; episodes: number } | null;
  favorite_genre: string | null;
  genres: Array<{ name: string; percent: number }>;
  archetype: { name: string; reason: string };
  favorites: Array<{ id: number; title: string; image: string }>;
  awards: Award[];
  available_awards?: Award[];
  last_30_days: number;
  best_day: { date: string; episodes: number } | null;
  months: Array<{ month: string; episodes: number }>;
  month_change: number | null;
  dated_history_incomplete: boolean;
};

const cache = new Map<string, { expires: number; data: Omit<Passport, 'own' | 'public' | 'available_awards'> }>();
const TTL = 60_000;
function parseArray<T>(value: unknown): T[] {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
async function settings(id: string): Promise<Settings> {
  const row = await db().prepare('SELECT is_public,favorite_ids,award_ids FROM passport_settings WHERE user_id=?')
    .bind(id).first<{ is_public: number; favorite_ids: unknown; award_ids: unknown }>();
  return { is_public: Number(row?.is_public || 0), favorite_ids: parseArray<number>(row?.favorite_ids), award_ids: parseArray<string>(row?.award_ids) };
}
export async function passportAccess(request: Request, id: string) {
  const [owner, target, configuration] = await Promise.all([
    viewer(request),
    db().prepare('SELECT * FROM users WHERE id=?').bind(id).first<User>(),
    settings(id),
  ]);
  if (!target || (!configuration.is_public && owner?.id !== id)) return null;
  return { user: target, own: owner?.id === id, settings: configuration };
}
export async function passportAwardOptions(id: string): Promise<Award[]> {
  const [achievements, pins] = await Promise.all([
    db().prepare(`SELECT a.id,a.name,c.image
      FROM user_achievements ua JOIN achievements a ON a.id=ua.achievement_id AND a.active=1
      LEFT JOIN achievement_rewards ar ON ar.achievement_id=a.id
      LEFT JOIN cosmetics c ON c.id=ar.cosmetic_id AND c.image IS NOT NULL
      WHERE ua.user_id=? GROUP BY a.id,a.name,c.image ORDER BY a.name`).bind(id)
      .all<{ id: string; name: string; image: string | null }>(),
    cosmeticsCatalog(id),
  ]);
  const unique = new Map<string, Award>();
  for (const item of achievements.results) unique.set(item.id, { ...item, kind: 'achievement' });
  for (const item of pins) if (item.kind === 'pin' && item.unlocked)
    unique.set(item.id, { id: item.id, name: item.name, image: item.image, kind: 'pin' });
  return [...unique.values()];
}
async function calculate(user: User, config: Settings): Promise<Omit<Passport, 'own' | 'public' | 'available_awards'>> {
  const id = user.id;
  const [views, watched, metadata, awards] = await Promise.all([
    db().prepare(`SELECT q.anime_id,q.episode,q.qualified_at FROM qualified_episode_views q
      WHERE q.user_id=? AND NOT EXISTS (
        SELECT 1 FROM passport_simulated_episodes s
        WHERE s.user_id=q.user_id AND s.anime_id=q.anime_id AND s.episode=q.episode
      )`).bind(id).all<EpisodeRow>(),
    db().prepare(`SELECT SUM(h.watched_seconds) AS seconds FROM history h
      WHERE h.user_id=? AND h.watched_seconds>0 AND NOT EXISTS (
        SELECT 1 FROM passport_simulated_episodes s
        WHERE s.user_id=h.user_id AND s.anime_id=h.anime_id AND s.episode=h.episode
      )`).bind(id).first<TimeRow>(),
    db().prepare('SELECT id,data FROM anime_cache WHERE id IN (SELECT DISTINCT anime_id FROM qualified_episode_views WHERE user_id=?) OR id IN (SELECT value::integer FROM jsonb_array_elements_text(?::jsonb) AS value)').bind(id, JSON.stringify(config.favorite_ids)).all<{ id: number; data: string }>(),
    passportAwardOptions(id),
  ]);
  const anime = new Map<number, Anime>();
  for (const row of metadata.results) {
    try { anime.set(Number(row.id), JSON.parse(row.data) as Anime); } catch {}
  }
  const perAnime = new Map<number, Set<number>>();
  const daily = new Map<string, number>();
  let undated = false, night = 0;
  const timezone = streakTimezone(process.env.STREAK_TIMEZONE);
  const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  for (const row of views.results) {
    const aid = Number(row.anime_id);
    if (!perAnime.has(aid)) perAnime.set(aid, new Set());
    perAnime.get(aid)!.add(Number(row.episode));
    if (row.qualified_at == null) { undated = true; continue; }
    const date = new Date(Number(row.qualified_at));
    const day = dayFormatter.format(date);
    daily.set(day, (daily.get(day) || 0) + 1);
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', hourCycle: 'h23' }).format(date));
    if (hour < 5) night++;
  }
  const genres = new Map<string, number>();
  let ongoing = 0, completed = 0, verifiable = 0;
  let longest: Passport['longest_anime'] = null;
  for (const [aid, episodes] of perAnime) {
    const title = anime.get(aid);
    if (title?.status === 'ongoing') ongoing++;
    const count = episodes.size;
    if (!longest || count > longest.episodes) longest = { id: aid, title: title?.russian || title?.name || `Аниме #${aid}`, episodes: count };
    if (title?.status === 'released' && Number(title.episodes) > 0 && Number(title.episodes) <= 5000) {
      verifiable++;
      if (Array.from({ length: Number(title.episodes) }, (_, i) => i + 1).every((n) => episodes.has(n))) completed++;
    }
    for (const name of new Set((title?.genres || []).map(normalizePassportGenre).filter(Boolean)))
      genres.set(name, (genres.get(name) || 0) + 1);
  }
  const topGenres = [...genres].sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([name, count]) => ({ name, percent: Math.round(count / Math.max(1, perAnime.size) * 100) }));
  const today = dayFormatter.format(new Date(now()));
  const thirty = now() - 30 * 86_400_000;
  const dated = views.results.filter((v) => v.qualified_at != null && Number(v.qualified_at) >= thirty).length;
  const monthly = new Map<string, number>();
  for (const [day, count] of daily) monthly.set(day.slice(0, 7), (monthly.get(day.slice(0, 7)) || 0) + count);
  const thisMonth = today.slice(0, 7);
  const previousMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
  const prev = monthly.get(previousMonth) || 0;
  const favoriteIds = config.favorite_ids.filter((value) => Number.isInteger(value) && value > 0).slice(0, 3);
  return {
    user: {
      id, nick: user.nick, avatar: user.avatar, tag: user.tag || null, pin: user.pin || null,
      created_at: user.created_at, number: createHash('sha256').update('anime-passport:' + id).digest('hex').slice(0, 12).toUpperCase(),
      streak: publicStreak(user).current, longest_streak: Number(user.longest_streak || 0),
    },
    episodes: views.results.length, anime_count: perAnime.size,
    watch_seconds: Number(watched?.seconds || 0) || null,
    completed_anime: verifiable && verifiable === perAnime.size ? completed : null, longest_anime: longest,
    favorite_genre: topGenres[0]?.name || null, genres: topGenres,
    archetype: passportArchetype({ episodes: views.results.length, anime: perAnime.size, genres: genres.size, ongoing, longest: longest?.episodes || 0, night }),
    favorites: favoriteIds.flatMap((aid) => {
      const title = anime.get(aid);
      return title ? [{ id: aid, title: title.russian || title.name, image: title.image?.original || '' }] : [];
    }),
    awards: config.award_ids.flatMap((aid) => awards.find((award) => award.id === aid) || []),
    last_30_days: dated,
    best_day: [...daily].sort((a, b) => b[1] - a[1])[0]
      ? { date: [...daily].sort((a, b) => b[1] - a[1])[0][0], episodes: [...daily].sort((a, b) => b[1] - a[1])[0][1] } : null,
    months: [...monthly].sort((a, b) => a[0].localeCompare(b[0])).slice(-12).map(([month, episodes]) => ({ month, episodes })),
    month_change: prev ? Math.round(((monthly.get(thisMonth) || 0) - prev) / prev * 100) : null,
    dated_history_incomplete: undated,
  };
}
export async function getPassport(user: User, config: Settings, own: boolean): Promise<Passport> {
  const key = user.id + ':' + JSON.stringify([config,user.nick,user.avatar,user.tag,user.pin,user.current_streak,user.longest_streak,user.last_streak_date]);
  let entry = cache.get(key);
  if (!entry || entry.expires < now()) {
    const data = await calculate(user, config);
    entry = { data, expires: now() + TTL };
    if (cache.size > 500) cache.clear();
    cache.set(key, entry);
  }
  return { ...entry.data, own, public: !!config.is_public, ...(own ? { available_awards: await passportAwardOptions(user.id) } : {}) };
}
export async function getSettings(id: string) { return settings(id); }
export function clearPassport(id: string) {
  for (const key of cache.keys()) if (key.startsWith(id + ':')) cache.delete(key);
}
