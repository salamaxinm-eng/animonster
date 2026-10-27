import { fail, json } from '@/lib/server/core';
import { paymentsReady } from '@/lib/server/payment-gateway';
import { playerCatalogFunding } from '@/lib/server/player-catalog-funding';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const { active, ...funding } = await playerCatalogFunding();
    return json({ ...funding, acceptingDonations: active && paymentsReady() });
  } catch (error) {
    return fail(error);
  }
}
