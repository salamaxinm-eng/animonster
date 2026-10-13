import { db, json, viewer } from '@/lib/server/core';
import { canViewBattlepass } from '@/lib/server/battlepass-access';
export async function GET(request: Request) {
  if (!canViewBattlepass(await viewer(request))) return new Response(null, { status: 404 });
  return json({ cosmetics: (await db().prepare("SELECT id,kind,slug,name,image,rarity FROM cosmetics WHERE access_type='battlepass' AND active=1 AND image IS NOT NULL").all()).results });
}
