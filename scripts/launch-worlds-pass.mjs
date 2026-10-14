// Operational entry point. Run in a trusted server shell with DATABASE_URL.
// Uses the same administrator validation, snapshots and publication as the UI.
import {registerHooks,stripTypeScriptTypes} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

const root=process.cwd();
registerHooks({
 resolve(specifier,context,next){
  if(specifier.startsWith('.')||specifier.startsWith('@/')){
   const base=specifier.startsWith('@/')?path.join(root,specifier.slice(2)):fileURLToPath(new URL(specifier,context.parentURL));
   for(const candidate of [base,base+'.ts',base+'.js']) if(existsSync(candidate)) return {url:pathToFileURL(candidate).href,shortCircuit:true};
  }
  return next(specifier,context);
 },
 load(url,context,next){
  if(url.endsWith('.ts')) return {format:'module',source:stripTypeScriptTypes(readFileSync(fileURLToPath(url),'utf8'),{mode:'transform'}),shortCircuit:true};
  return next(url,context);
 }
});
if(!process.env.DATABASE_URL) throw Error('DATABASE_URL is required');
const {db,now,uid}=await import('../lib/server/core.ts');
const {findSeason}=await import('../lib/server/battlepass.ts');
const {savePassReward,passReadiness,publishPass}=await import('../lib/server/battlepass-admin.ts');
const {passDay,dayStart,addDays}=await import('../lib/battlepass.ts');
const manifest=JSON.parse(await readFile('public/rewards/pass-worlds-2026/manifest.json','utf8'));
const season=await findSeason(manifest.id,true);
if(!season) throw Error('Season missing');
if(season.status==='published'){
 console.log(JSON.stringify({alreadyPublished:true,id:season.id,price:season.price,starts_at:season.starts_at,ends_at:season.ends_at}));
 process.exit(0);
}
const actor=await db().prepare("SELECT id FROM users WHERE role='admin' ORDER BY created_at LIMIT 1").first();
if(!actor) throw Error('Administrator missing');
const claims=await db().prepare('SELECT count(*)::int n FROM pass_claims WHERE season_id=?').bind(season.id).first();
const members=await db().prepare('SELECT count(*)::int n FROM pass_members WHERE season_id=?').bind(season.id).first();
if(claims.n||members.n) throw Error('Draft already has participants or grants; inspect before changing');
if(manifest.rewards.length!==44||manifest.rewards.filter(r=>r.file).length!==34) throw Error('Incomplete manifest');
if(process.argv.includes('--launch')){
 // Human authorization: restore the exact original table, including empty free levels.
 const rewards=(await db().prepare('SELECT * FROM pass_rewards WHERE season_id=?').bind(season.id).all()).results;
 for(let level=1;level<=40;level++) for(const track of ['free','premium']){
  const expected=manifest.rewards.filter(r=>r.level===level&&r.track===track);
  const current=rewards.filter(r=>Number(r.level)===level&&r.track===track);
  const items=expected.filter(r=>r.kind!=='plus').map(r=>r.kind+':'+r.slug);
  const plus_days=expected.reduce((n,r)=>n+(r.plus_days||0),0);
  const matches=current.length===expected.length&&expected.every(r=>current.some(c=>c.kind===r.kind&&c.name===r.name&&(r.kind==='plus'?Number(c.plus_days)===r.plus_days:c.cosmetic_id===r.kind+':'+r.slug)));
  if(!matches) await savePassReward(actor.id,{season:season.id,level,track,items,plus_days});
 }
 // One minute allows publication to validate and snapshot all images before sales start.
 const start=now()+60000;
 const end=dayStart(addDays(passDay(start,season.timezone),56),season.timezone);
 await db().transaction(async tx=>{
  const locked=await tx.prepare('SELECT status FROM pass_seasons WHERE id=? FOR UPDATE').bind(season.id).first();
  if(locked?.status!=='draft') throw Error('Season changed');
  await tx.prepare('UPDATE pass_seasons SET starts_at=?,ends_at=? WHERE id=?').bind(start,end,season.id).run();
  await tx.prepare('INSERT INTO pass_audit(id,actor_id,season_id,action,reason,detail,created_at) VALUES (?,?,?,?,?,?::jsonb,?)').bind(uid(),actor.id,season.id,'launch_schedule','Запуск продаж по поручению владельца',JSON.stringify({before:{starts_at:season.starts_at,ends_at:season.ends_at},after:{starts_at:start,ends_at:end}}),now()).run();
 });
 const updated=await findSeason(season.id,true);
 const errors=await passReadiness(updated);
 if(errors.length) throw Error(errors.join('; '));
 await publishPass(actor.id,season.id);
 console.log(JSON.stringify({published:true,id:season.id,price:season.price,starts_at:start,ends_at:end,rewards:44,cosmetics:34,plusDays:30}));
}else{
 const errors=await passReadiness(season);
 console.log(JSON.stringify({id:season.id,status:season.status,price:season.price,problems:errors}));
}
process.exit(0);
