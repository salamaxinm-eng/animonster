import { fail, json, requireUser } from '@/lib/server/core';
import {
  evaluateUserAchievements,
  userAchievementProgress,
} from '@/lib/server/achievements';
import { onePieceOverview } from '@/lib/server/one-piece';

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    await evaluateUserAchievements(user.id);
    const [base, piece] = await Promise.all([
      userAchievementProgress(user.id),
      onePieceOverview(user.id),
    ]);
    return json({
      ...base,
      achievements: [
        ...base.achievements.map((item) => ({
          ...item,
          folder:
            item.anime_id === 21
              ? 'one-piece'
              : item.anime_id
                ? 'anime'
                : 'other',
        })),
        ...piece.achievements.map((item) => ({ ...item, folder: 'one-piece' })),
      ],
      one_piece: {
        count: piece.count,
        xp: piece.xp,
        rank: piece.rank,
        unlocked: piece.unlocked,
        total: piece.achievements.length,
      },
    });
  } catch (error) {
    return fail(error);
  }
}
