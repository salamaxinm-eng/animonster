import { fail, json, requireUser } from '@/lib/server/core';
import { evaluateUserAchievements } from '@/lib/server/achievements';
import { achievementOverview } from '@/lib/server/achievement-overview';

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    await evaluateUserAchievements(user.id);
    return json(await achievementOverview(user.id));
  } catch (error) {
    return fail(error);
  }
}
