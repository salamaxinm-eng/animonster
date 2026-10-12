import { db, json } from '@/lib/server/core';
export async function GET() {
  return json({ cosmetics: (await db().prepare("SELECT id,kind,slug,name,image,rarity FROM cosmetics WHERE access_type='battlepass' AND active=1 AND image IS NOT NULL").all()).results });
}
