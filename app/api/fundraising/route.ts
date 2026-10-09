import { fail, json, viewer } from '@/lib/server/core';
import { fundraisingGoals } from '@/lib/server/fundraising';

export async function GET(request: Request) {
  try {
    const user = await viewer(request);
    return json({ goals: await fundraisingGoals(user?.id) });
  } catch (error) {
    return fail(error);
  }
}
