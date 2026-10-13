import { ApiError, body, db, fail, json, requireUser, sameOrigin } from '@/lib/server/core';
import { findSeason, eligiblePassGenres, passOverview } from '@/lib/server/battlepass';
import { adjustPassXp, passReadiness, publishPass, savePassDraft, savePassReward, uploadPassItem, reconcilePassPayment } from '@/lib/server/battlepass-admin';
import { requireBattlepassAccess } from '@/lib/server/battlepass-access';
async function admin(r: Request) { const u = await requireUser(r); requireBattlepassAccess(u); if (u.role !== 'admin') throw new ApiError('Недоступно', 403); return u; }
export async function GET(r: Request) {
  try {
    await admin(r); const params = new URL(r.url).searchParams, id = params.get('season') || 'oni-awakening';
    const s = await findSeason(id, true);
    const [seasons, catalog, genres, members, audit, purchases] = await Promise.all([
      db().prepare('SELECT * FROM pass_seasons ORDER BY created_at DESC').all(),
      db().prepare("SELECT id,kind,slug,name,image FROM cosmetics WHERE access_type='battlepass' ORDER BY kind,name").all(),
      eligiblePassGenres(),
      db().prepare('SELECT m.*,u.nick FROM pass_members m JOIN users u ON u.id=m.user_id WHERE m.season_id=? ORDER BY m.xp DESC LIMIT 100').bind(id).all(),
      db().prepare('SELECT * FROM pass_audit WHERE season_id=? OR season_id IS NULL ORDER BY created_at DESC LIMIT 100').bind(id).all(),
      db().prepare('SELECT p.*,o.provider_id,o.status,o.amount FROM pass_purchases p JOIN orders o ON o.id=p.order_id WHERE p.season_id=? ORDER BY p.created_at DESC LIMIT 100').bind(id).all(),
    ]);
    const user = params.get('user');
    const progress = user ? await passOverview(user, id, true) : null;
    const ledger = user ? (await db().prepare('SELECT * FROM pass_xp WHERE season_id=? AND user_id=? ORDER BY created_at DESC LIMIT 200').bind(id, user).all()).results : [];
    const rewards = s ? (await db().prepare('SELECT * FROM pass_rewards WHERE season_id=? ORDER BY level,track').bind(id).all()).results : [];
    return json({ seasons: seasons.results, season: s, catalog: catalog.results, genres, members: members.results, audit: audit.results, purchases: purchases.results, rewards, progress, ledger, problems: s && s.status === 'draft' ? await passReadiness(s) : [] });
  } catch (error) { return fail(error); }
}
export async function POST(r: Request) {
  try {
    sameOrigin(r); const actor = await admin(r);
    if (r.headers.get('content-type')?.includes('multipart/form-data')) return json(await uploadPassItem(actor.id, await r.formData()));
    const input = await body(r);
    if (input.action === 'reconcile_payment') return json(await reconcilePassPayment(actor.id, String(input.providerId)));
    if (input.action === 'save') return json(await savePassDraft(actor.id, input));
    if (input.action === 'reward') return json(await savePassReward(actor.id, input));
    if (input.action === 'publish') return json(await publishPass(actor.id, String(input.season)));
    if (input.action === 'adjust') return json(await adjustPassXp(actor.id, String(input.season), String(input.user), Number(input.delta), String(input.reason), String(input.requestId)));
    throw new ApiError('Неизвестное действие');
  } catch (error) { return fail(error); }
}
