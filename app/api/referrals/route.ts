import { fail, json, requireUser } from '@/lib/server/core';
import { referralDashboard } from '@/lib/server/referrals';

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return json(
      await referralDashboard(user.id, new URL(request.url).origin),
    );
  } catch (error) {
    return fail(error);
  }
}
