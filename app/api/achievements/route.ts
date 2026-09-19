import { fail, json, requireUser } from '@/lib/server/core';
import {
  evaluateUserAchievements,
  userAchievementProgress,
} from '@/lib/server/achievements';

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    await evaluateUserAchievements(user.id);
    return json(await userAchievementProgress(user.id));
  } catch (error) {
    return fail(error);
  }
}
