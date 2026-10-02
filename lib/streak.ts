export type StreakTier = 'day' | 'week' | 'month' | 'hundred' | 'year';

export type Streak = {
  current: number;
  longest: number;
  lastActiveDate: string | null;
  tier: StreakTier;
};

const DEFAULT_TIMEZONE = 'Europe/Moscow';

export function streakTimezone(value?: string) {
  try {
    const zone = value || DEFAULT_TIMEZONE;
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function streakDate(timestamp: number, timezone = DEFAULT_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: streakTimezone(timezone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const value = (part: string) => parts.find((item) => item.type === part)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function previousStreakDate(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function streakTier(current: number): StreakTier {
  if (current >= 365) return 'year';
  if (current >= 100) return 'hundred';
  if (current >= 30) return 'month';
  if (current >= 7) return 'week';
  return 'day';
}

export function streakAsset(tier: StreakTier) {
  return `/streak/streak-${{ day: 1, week: 7, month: 30, hundred: 100, year: 365 }[tier]}.png`;
}

export function effectiveStreak(
  row: { current_streak?: number | null; longest_streak?: number | null; last_streak_date?: string | null } | null,
  today: string,
): Streak {
  const lastActiveDate = row?.last_streak_date || null;
  const current =
    lastActiveDate === today || lastActiveDate === previousStreakDate(today)
      ? Number(row?.current_streak || 0)
      : 0;
  return {
    current,
    longest: Number(row?.longest_streak || 0),
    lastActiveDate,
    tier: streakTier(current),
  };
}

export function streakThreshold(duration: number) {
  return Math.min(12 * 60, Math.ceil(duration * 0.5));
}

export const STREAK_DAY_PROGRESS_SQL = `INSERT INTO streak_episode_days(user_id,day,anime_id,episode,watched_seconds)
  VALUES (?,?,?,?,?)
  ON CONFLICT(user_id,day,anime_id,episode) DO UPDATE SET
    watched_seconds=LEAST(?,streak_episode_days.watched_seconds+excluded.watched_seconds)
  RETURNING watched_seconds`;

export const STREAK_ADVANCE_SQL = `UPDATE users SET
    current_streak=CASE WHEN last_streak_date=? THEN current_streak+1 ELSE 1 END,
    longest_streak=GREATEST(longest_streak,CASE WHEN last_streak_date=? THEN current_streak+1 ELSE 1 END),
    last_streak_date=?
  WHERE id=? AND (last_streak_date IS NULL OR last_streak_date<?)`;
