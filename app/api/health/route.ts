import { db, json } from '@/lib/server/core';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await db().prepare('SELECT 1 AS ok').first();
    return json({ status: 'ok' });
  } catch {
    return json({ status: 'unavailable' }, 503);
  }
}
