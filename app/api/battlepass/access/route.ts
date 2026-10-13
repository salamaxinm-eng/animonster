import { json, viewer } from '@/lib/server/core';
import { canViewBattlepass } from '@/lib/server/battlepass-access';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return json({ visible: canViewBattlepass(await viewer(request)) });
}
