import { ApiError, db, fail, json, requireUser, sameOrigin } from '@/lib/server/core';
import { generateCosmetic, grantGeneratedCosmetic, publishCosmetic } from '@/lib/server/cosmetic-generator';

async function admin(request: Request) {
  const user = await requireUser(request);
  if (user.role !== 'admin') throw new ApiError('Только администратор', 403);
  return user;
}

export async function GET(request: Request) {
  try {
    await admin(request);
    const rows = await db().prepare(`SELECT id,batch_id,anime,kind,rarity,concept,model,status,cosmetic_id,created_at,published_at
      FROM cosmetic_generations ORDER BY created_at DESC LIMIT 100`).all();
    return json({ configured: !!(process.env.COSMETIC_IMAGE_API_KEY || process.env.OPENAI_API_KEY), generations: rows.results });
  } catch (error) { return fail(error); }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await admin(request);
    const form = await request.formData();
    const action = String(form.get('action') || 'generate');
    if (action === 'generate') return json(await generateCosmetic(user.id, form));
    const id = String(form.get('id') || '');
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new ApiError('Некорректный ID');
    if (action === 'publish') return json(await publishCosmetic(user.id, id));
    if (action === 'grant') return json(await grantGeneratedCosmetic(user.id, id, String(form.get('user') || '')));
    throw new ApiError('Неизвестное действие');
  } catch (error) { return fail(error); }
}
