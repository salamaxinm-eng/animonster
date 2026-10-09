import { ApiError, body, fail, json, requireUser, runtime, sameOrigin } from '@/lib/server/core';
import { grantPilotVpnDays } from '@/lib/server/vpn';

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const admin = await requireUser(request);
    if (admin.role !== 'admin' || runtime().VPN_PILOT_GRANTS_ENABLED !== 'true')
      throw new ApiError('Недоступно', 403);
    const input = await body(request);
    return json(await grantPilotVpnDays(String(input.userId || ''), Number(input.days)));
  } catch (error) {
    return fail(error);
  }
}
