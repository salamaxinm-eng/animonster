import { db, fail, json } from '@/lib/server/core';
export async function GET() {
  try {
    const rows = await db().prepare(`SELECT id,slug,kind,name,image,rarity FROM cosmetics
      WHERE active=1 AND access_type='admin' AND image LIKE '/api/cosmetic-generator/assets/%' ORDER BY created_at DESC LIMIT 500`).all();
    return json({ cosmetics: rows.results });
  } catch (error) { return fail(error); }
}
