import { userAchievementProgress } from './achievements';
import { onePieceOverview } from './one-piece';
import { groupAchievementFolders } from '../achievement-folders';

// Both the achievement catalog and profile counters read this same catalog.
// Reading another profile never grants achievements or changes its progress.
export async function achievementOverview(userId: string) {
  const [base, piece] = await Promise.all([
    userAchievementProgress(userId),
    onePieceOverview(userId),
  ]);
  const grouped = groupAchievementFolders([
    ...base.achievements,
    ...piece.achievements.map((item) => ({
      ...item,
      anime_id: 21,
      anime_title: 'Ван-Пис',
    })),
  ]);
  return {
    ...base,
    ...grouped,
    one_piece: {
      count: piece.count,
      xp: piece.xp,
      rank: piece.rank,
      unlocked: piece.unlocked,
      total: piece.achievements.length,
    },
  };
}
