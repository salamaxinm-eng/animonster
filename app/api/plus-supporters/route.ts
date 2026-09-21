import { fail, json } from '@/lib/server/core';
import { supporterLeaderboard } from '@/lib/server/supporters';

export async function GET() {
  try {
    return json({ leaders: await supporterLeaderboard() });
  } catch (error) {
    return fail(error);
  }
}
