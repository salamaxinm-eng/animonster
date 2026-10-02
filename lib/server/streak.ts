import { db, now } from './core';
import { effectiveStreak, previousStreakDate, streakDate, streakThreshold, STREAK_DAY_PROGRESS_SQL, STREAK_ADVANCE_SQL } from '@/lib/streak';

export function streakDay(timestamp = now()) {
  return streakDate(timestamp, process.env.STREAK_TIMEZONE);
}

export async function recordStreakProgress(
  database: ReturnType<typeof db>,
  userId: string,
  animeId: number,
  episode: number,
  duration: number,
  seconds: number,
  day: string,
) {
  if (seconds <= 0 || duration <= 0) return;
  const row = await database.prepare(STREAK_DAY_PROGRESS_SQL)
    .bind(userId, day, animeId, episode, seconds, duration)
    .first<{ watched_seconds: number }>();
  if (Number(row?.watched_seconds || 0) < streakThreshold(duration)) return;
  const yesterday = previousStreakDate(day);
  await database.prepare(STREAK_ADVANCE_SQL)
    .bind(yesterday, yesterday, day, userId, day)
    .run();
}

export function publicStreak(user: {
  current_streak?: number | null;
  longest_streak?: number | null;
  last_streak_date?: string | null;
}) {
  return effectiveStreak(user, streakDay());
}
