import { db, now } from './core';
import { grantCosmetic } from './cosmetics';

type AchievementRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  metric: 'completed_episodes' | 'anime_completed_episodes';
  threshold: number;
  anime_id: number | null;
  sort_order: number;
};

async function completedEpisodes(userId: string, animeId?: number | null) {
  const row = await db()
    .prepare(
      animeId
        ? 'SELECT COALESCE(sum(completed),0) AS value FROM history WHERE user_id=? AND anime_id=?'
        : 'SELECT COALESCE(sum(completed),0) AS value FROM history WHERE user_id=?',
    )
    .bind(...(animeId ? [userId, animeId] : [userId]))
    .first<{ value: number }>();
  return Number(row?.value || 0);
}

export async function evaluateUserAchievements(
  userId: string,
  changedAnimeId?: number,
) {
  const rows = await db()
    .prepare(
      `SELECT id,slug,name,description,category,metric,threshold,anime_id,sort_order
       FROM achievements WHERE active=1 AND (?=-1 OR anime_id IS NULL OR anime_id=?)
       ORDER BY sort_order,id`,
    )
    .bind(changedAnimeId || -1, changedAnimeId || -1)
    .all<AchievementRow>();
  const overall = await completedEpisodes(userId);
  const perAnime = new Map<number, number>();
  const unlocked: string[] = [];
  for (const achievement of rows.results) {
    let progress = overall;
    if (achievement.metric === 'anime_completed_episodes') {
      const animeId = Number(achievement.anime_id);
      if (!perAnime.has(animeId))
        perAnime.set(animeId, await completedEpisodes(userId, animeId));
      progress = perAnime.get(animeId)!;
    }
    if (progress < achievement.threshold) continue;
    const inserted = await db()
      .prepare(
        `INSERT INTO user_achievements(user_id,achievement_id,unlocked_at)
         VALUES (?,?,?) ON CONFLICT DO NOTHING RETURNING achievement_id`,
      )
      .bind(userId, achievement.id, now())
      .first<{ achievement_id: string }>();
    const rewards = await db()
      .prepare(
        `SELECT c.slug FROM achievement_rewards ar JOIN cosmetics c ON c.id=ar.cosmetic_id
         WHERE ar.achievement_id=?`,
      )
      .bind(achievement.id)
      .all<{ slug: string }>();
    for (const reward of rewards.results)
      await grantCosmetic(
        userId,
        reward.slug,
        'achievement',
        `${achievement.id}:${reward.slug}`,
        { achievement: achievement.slug },
      );
    if (inserted) unlocked.push(achievement.slug);
  }
  return { unlocked };
}

export async function userAchievementProgress(userId: string) {
  const rewards = await db()
    .prepare(`SELECT ar.achievement_id,c.kind,c.slug,c.name,c.image
      FROM achievement_rewards ar JOIN cosmetics c ON c.id=ar.cosmetic_id
      WHERE c.active=1 ORDER BY c.kind,c.sort_order`)
    .all<{
      achievement_id: string;
      kind: string;
      slug: string;
      name: string;
      image: string | null;
    }>();
  const rows = await db()
    .prepare(
      `SELECT a.id,a.slug,a.name,a.description,a.category,a.metric,a.threshold,a.anime_id,a.sort_order,
       ua.unlocked_at FROM achievements a LEFT JOIN user_achievements ua
       ON ua.achievement_id=a.id AND ua.user_id=? WHERE a.active=1 ORDER BY a.sort_order,a.id`,
    )
    .bind(userId)
    .all<AchievementRow & { unlocked_at: number | null }>();
  const overall = await completedEpisodes(userId);
  const perAnime = new Map<number, number>();
  const achievements = [];
  for (const item of rows.results) {
    let progress = overall;
    if (item.metric === 'anime_completed_episodes') {
      const animeId = Number(item.anime_id);
      if (!perAnime.has(animeId))
        perAnime.set(animeId, await completedEpisodes(userId, animeId));
      progress = perAnime.get(animeId)!;
    }
    achievements.push({
      ...item,
      progress,
      completed: !!item.unlocked_at,
      rewards: rewards.results.filter(
        (reward) => reward.achievement_id === item.id,
      ),
    });
  }
  return { completed_episodes: overall, achievements };
}
