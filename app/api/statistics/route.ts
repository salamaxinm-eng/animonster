import { fail, json } from '@/lib/server/core';
import { publicStatistics } from '@/lib/server/statistics';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return json(await publicStatistics());
  } catch (error) {
    return fail(error);
  }
}
