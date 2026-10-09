import { body, fail, json } from '@/lib/server/core';
import { claimVpnJob, completeVpnJob, requireAgent } from '@/lib/server/vpn';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    requireAgent(request);
    return json({ job: await claimVpnJob() });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    requireAgent(request);
    return json(await completeVpnJob(await body(request)));
  } catch (error) {
    return fail(error);
  }
}
