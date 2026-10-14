import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import sharp from 'sharp';
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
async function module(file,replacements={}){let s=stripTypeScriptTypes(await readFile(file,'utf8'));for(const[a,b]of Object.entries(replacements))s=s.replaceAll("'"+a+"'",JSON.stringify(b));return url(s)}
function database(engine){return {prepare(source){let values=[],i=0;const sql=source.replace(/\?/g,()=>'$'+ ++i);return {bind(...v){values=v;return this},async first(){return(await engine.query(sql,values)).rows[0]??null},async all(){return{results:(await engine.query(sql,values)).rows}},async run(){return engine.query(sql,values)}}},transaction(fn){return engine.transaction(tx=>fn(database(tx)))}}}
const manifest=JSON.parse(await readFile('public/rewards/pass-worlds-2026/manifest.json','utf8'));
test('44 exact slots, 34 real assets, no missing files, transparency and unchanged artwork dimensions',async()=>{
 assert.equal(manifest.rewards.length,44);assert.equal(manifest.rewards.filter(r=>r.track==='premium').length,40);
 assert.deepEqual(manifest.rewards.filter(r=>r.track==='free').map(r=>r.level),[10,20,30,40]);
 assert.equal(manifest.rewards.filter(r=>r.file).length,34);assert.equal(manifest.rewards.filter(r=>r.kind!=='plus'&&!r.file).length,0);
 assert.deepEqual(manifest.rewards.filter(r=>r.kind==='plus').map(r=>r.level),[4,8,12,16,20,24,28,32,36,40]);
 assert.equal(manifest.rewards.reduce((n,r)=>n+(r.plus_days||0),0),30);
 assert.equal(new Set(manifest.rewards.filter(r=>r.file).map(r=>r.source)).size,34);
 for(const r of manifest.rewards.filter(r=>r.file)){
  const bytes=await readFile('public/rewards/pass-worlds-2026/'+r.file);assert.equal(createHash('sha256').update(bytes).digest('hex'),r.sha256);
  const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if(r.kind!=='background'){assert.equal(data[3],0,r.name);assert.ok(data.some((v,i)=>i%4===3&&v===255),r.name)}
  if(r.kind==='frame')assert.equal(data[(Math.floor(info.height/2)*info.width+Math.floor(info.width/2))*4+3],0,r.name);
 }
});
test('existing ledger: draft protection, paid eligibility, exactly-once Plus, paid expiry preservation and rollback',async()=>{
 const engine=new PGlite({extensions:{pg_trgm}});globalThis.worldsDb=database(engine);globalThis.worldsNow=Date.parse('2026-10-13T00:00:00Z');
 const core=url('export const db=()=>globalThis.worldsDb;export const now=()=>globalThis.worldsNow;export const premium=async()=>0;export const uid=()=>crypto.randomUUID();export class ApiError extends Error{}');
 const sharedUrl=await module('lib/battlepass.ts');const shared=await import(sharedUrl);
 const plusUrl=await module('lib/server/plus.ts',{'./core':core});
 const serviceUrl=await module('lib/server/battlepass.ts',{'./core':core,'./plus':plusUrl,'../battlepass':sharedUrl});const service=await import(serviceUrl);
 const admin=await import(await module('lib/server/battlepass-admin.ts',{'./core':core,'../battlepass':sharedUrl,'./battlepass':serviceUrl,'sharp':import.meta.resolve('sharp'),'./billing':url('export const paymentFetch=()=>{};export const verifyPayment=()=>{}')}));
 try{
  for(const file of(await readdir('migrations/postgres')).filter(f=>f.endsWith('.sql')).sort())await engine.exec(await readFile('migrations/postgres/'+file,'utf8'));
  const n=async sql=>(await engine.query(sql)).rows[0].n;
  assert.equal(await n('SELECT count(*)::int n FROM user_cosmetics'),0);assert.equal(await n('SELECT count(*)::int n FROM pass_claims'),0);
  const draft=await service.findSeason(manifest.id,true);assert.equal(draft.status,'draft');assert.equal(draft.expected_rewards.length,44);
  const problems=await admin.passReadiness(draft);
  for(const missing of manifest.rewards.filter(r=>r.kind!=='plus'&&!r.file))assert.ok(problems.some(p=>p.includes(missing.name)),missing.name);
  assert.ok(!problems.some(p=>p.includes('ассет:')),'all assigned images validate, Plus does not need artwork');
  await assert.rejects(admin.publishPass('test-worlds',manifest.id));
  const overview=await service.passOverview(null,manifest.id,true);assert.equal(overview.rewards.length,44);assert.equal(overview.rewards.filter(r=>r.kind==='plus').length,10);
  await engine.exec("INSERT INTO users(id,identity,nick,created_at) VALUES ('test-worlds','test:worlds','Test',0)");
  await assert.rejects(service.claimPass('test-worlds',manifest.id));
  await assert.rejects(globalThis.worldsDb.transaction(tx=>service.claimInTransaction(tx,draft,'test-worlds',{xp:16000,premium:true})));
  // Test database only: release the draft to exercise the production claim implementation.
  await engine.query("UPDATE pass_seasons SET starts_at=$1,ends_at=$2,tasks=$3,status='published' WHERE id=$4",[globalThis.worldsNow-1,globalThis.worldsNow+86400000,JSON.stringify(shared.PASS_TASKS),manifest.id]);
  await engine.query('INSERT INTO pass_members(season_id,user_id,xp,premium,joined_at) VALUES ($1,$2,16000,false,0)',[manifest.id,'test-worlds']);
  assert.equal((await service.claimPass('test-worlds',manifest.id)).count,4);assert.equal(await n('SELECT count(*)::int n FROM grants'),0);
  await engine.exec("UPDATE pass_members SET premium=true,xp=1200 WHERE user_id='test-worlds'");
  assert.equal((await service.claimPass('test-worlds',manifest.id)).count,3);assert.equal(await n('SELECT count(*)::int n FROM grants'),0);
  const expiry=globalThis.worldsNow+14*86400000;
  await engine.query("INSERT INTO grants(order_id,user_id,starts_at,expires) VALUES ('paid-existing','test-worlds',$1,$2)",[globalThis.worldsNow,expiry]);
  await engine.exec("UPDATE pass_members SET xp=16000 WHERE user_id='test-worlds'");
  await Promise.all([service.claimPass('test-worlds',manifest.id),service.claimPass('test-worlds',manifest.id)]);
  assert.equal(await n('SELECT count(*)::int n FROM grants'),11);assert.equal(await n('SELECT count(*)::int n FROM pass_claims'),44);assert.equal(await n('SELECT count(*)::int n FROM user_cosmetics'),34);
  assert.equal(Number((await engine.query("SELECT max(expires) expiry FROM grants WHERE user_id='test-worlds'")).rows[0].expiry),expiry+30*86400000);
  assert.equal((await service.claimPass('test-worlds',manifest.id)).count,0);
  await engine.exec("INSERT INTO users(id,identity,nick,created_at) VALUES ('rollback','test:rollback','Rollback',0)");
  const plus=await import(plusUrl);
  await assert.rejects(globalThis.worldsDb.transaction(async tx=>{await plus.grantPlusDays('rollback',3,'rollback','Test',tx);throw Error('rollback')}));
  assert.equal(await n("SELECT count(*)::int n FROM grants WHERE user_id='rollback'"),0);
  await plus.grantPlusDays('rollback',3,'expired-test','Test');await plus.grantPlusDays('rollback',3,'expired-test','Test');
  assert.equal(Number((await engine.query("SELECT expires FROM grants WHERE user_id='rollback'")).rows[0].expires),globalThis.worldsNow+3*86400000);
 }finally{await engine.close();delete globalThis.worldsDb;delete globalThis.worldsNow}
});
