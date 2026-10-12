import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
import sharp from 'sharp';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
async function module(path,replacements={}) {let s=stripTypeScriptTypes(await readFile(path,'utf8'));for(const [a,b]of Object.entries(replacements))s=s.replaceAll("'"+a+"'",JSON.stringify(b));return url(s);}
function database(engine){return {prepare(source){let values=[],i=0;const sql=source.replace(/\?/g,()=>'$'+ ++i);return {bind(...v){values=v;return this},async first(){return (await engine.query(sql,values)).rows[0]??null},async all(){return {results:(await engine.query(sql,values)).rows}},async run(){return engine.query(sql,values)}}},transaction(fn){return engine.transaction(tx=>fn(database(tx)))}}}
const sharedUrl=await module('lib/battlepass.ts');const shared=await import(sharedUrl);
void test('calendar, cumulative balance, coverage and discontinuous playback',()=>{
 const {starts_at,ends_at}=shared.seasonDates('2026-10-12','Asia/Yekaterinburg');assert.equal(new Date(starts_at).toISOString(),'2026-10-11T19:00:00.000Z');assert.equal(ends_at-starts_at,56*86400000);assert.equal(shared.passWeek(starts_at+7*86400000-1,starts_at,'Asia/Yekaterinburg'),1);assert.equal(shared.passWeek(starts_at+7*86400000,starts_at,'Asia/Yekaterinburg'),2);
 const dst=shared.seasonDates('2026-10-01','Europe/Berlin');assert.equal(dst.ends_at-dst.starts_at,56*86400000+3600000);
 assert.equal(32*shared.PASS_TASKS.daily.reduce((a,t)=>a+t.xp,0)+8*shared.PASS_TASKS.weekly.reduce((a,t)=>a+t.xp,0)+shared.PASS_TASKS.seasonal.reduce((a,t)=>a+t.xp,0),16000);assert.equal(shared.passLevel(15999),39);assert.equal(shared.passLevel(16000),40);assert.equal(shared.passLevel(0),0);
 let r=shared.mergeCoverage([[0,30],[60,80]],[20,40],100);assert.equal(shared.coverageSeconds(r),60);r=shared.mergeCoverage(r,[0,40],100);assert.equal(shared.coverageSeconds(r),60);
 assert.equal(shared.confirmedDelta({t:0,p:0},{t:1000,p:1}),1);assert.equal(shared.confirmedDelta({t:0,p:0},{t:1000,p:90}),0);assert.equal(shared.confirmedDelta({t:0,p:3},{t:1000,p:3}),0);assert.equal(shared.confirmedDelta({t:0,p:0},{t:9000,p:9}),0);
});
void test('real database: watch ledger, concurrent players, claims, late payments and settlement',async()=>{
 const engine=new PGlite({extensions:{pg_trgm}});globalThis.passTestDb=database(engine);globalThis.passTestTime=Date.parse('2026-10-12T00:00:00Z');
 const core=url(`export const db=()=>globalThis.passTestDb;export const now=()=>globalThis.passTestTime;export const uid=()=>crypto.randomUUID();export class ApiError extends Error {constructor(m,status=400){super(m);this.status=status}}`);
 const serviceUrl=await module('lib/server/battlepass.ts',{'./core':core,'../battlepass':sharedUrl});const service=await import(serviceUrl);const payment=await import(await module('lib/server/battlepass-payment.ts',{'./core':core,'./battlepass':serviceUrl}));
 try {
 for(const file of (await readdir('migrations/postgres')).filter(f=>f.endsWith('.sql')).sort())await engine.exec(await readFile('migrations/postgres/'+file,'utf8'));
 const finale=(await engine.query("SELECT cosmetic_id,level,track FROM pass_rewards WHERE cosmetic_id IN ('pin:pass-oni','tag:pass-oni','frame:pass-oni','background:pass-oni')")).rows;
 assert.equal(finale.length,4);assert.ok(finale.every(r=>r.level===40&&r.track==='premium'));
 const tags=(await engine.query("SELECT c.name,c.image,r.name AS reward_name,r.preview FROM cosmetics c JOIN pass_rewards r ON r.cosmetic_id=c.id WHERE r.season_id='oni-awakening' AND c.kind='tag' ORDER BY c.id")).rows;
 const russianOrder=(a,b)=>a.localeCompare(b,'ru');
 assert.deepEqual(tags.map(t=>t.name).sort(russianOrder),['БАНКАЙ','ВОЛЯ ОГНЯ','НАКАМА НАВСЕГДА','ПРОБУЖДЕНИЕ ОНИ','ЧЕТЫРЕ МИРА','ЧЁРНЫЕ БЫКИ'].sort(russianOrder));
 for(const tag of tags){assert.equal(tag.name,tag.reward_name);assert.equal(tag.image,tag.preview);assert.match(tag.image,/-ru\.png$/);const stats=await sharp('public'+tag.image).stats();assert.equal(stats.channels.at(-1).min,0)}
 for(const name of ['pin','frame']){const stats=await sharp('public/rewards/pass/oni-final-'+name+'.png').stats();assert.equal(stats.channels.at(-1).min,0)}
 const start=globalThis.passTestTime,end=start+56*86400000;
 await engine.query("INSERT INTO users(id,identity,nick,created_at) VALUES ('tester','test:pass','Tester',0)");
 await engine.query("UPDATE pass_seasons SET starts_at=$1,ends_at=$2,timezone='UTC',tasks=$3,genres='[\"Action\",\"Adventure\"]' WHERE id='oni-awakening'",[start,end,JSON.stringify(shared.PASS_TASKS)]);
 await engine.exec("DELETE FROM pass_rewards WHERE season_id='oni-awakening'");
 await engine.exec("INSERT INTO pass_rewards(season_id,level,track,cosmetic_id,kind,name,preview) VALUES ('oni-awakening',1,'free','pin:pass-oni','pin','Test','/test.png'),('oni-awakening',1,'premium','tag:pass-oni','tag','Test','/test.png'); UPDATE pass_seasons SET status='published' WHERE id='oni-awakening'");
 await assert.rejects(engine.exec("UPDATE pass_seasons SET price=1 WHERE id='oni-awakening'"));await assert.rejects(engine.exec("DELETE FROM pass_rewards WHERE season_id='oni-awakening'"));
 const first=await service.startPassWatch('tester','auth',{anime:1,episode:1,duration:3000,genres:['Action','Adventure']});const second=await service.startPassWatch('tester','auth',{anime:1,episode:1,duration:3000,genres:['Action','Adventure']});
 let seq=1;for(let from=0;from<2400;from+=100){const samples=Array.from({length:from===0?101:100},(_,i)=>({t:(from+i+(from===0?0:1))*1000,p:from+i+(from===0?0:1)}));globalThis.passTestTime=start+(from+100)*1000;await service.recordPassWatch('tester','auth',first.token,seq++,samples)}
 const row=(await engine.query("SELECT xp FROM pass_members WHERE user_id='tester'")).rows[0];assert.equal(row.xp,200);
 const dup=await service.recordPassWatch('tester','auth',first.token,24,[{t:2400000,p:2400}]);assert.equal(dup.duplicate,true);
 const other=await service.recordPassWatch('tester','auth',second.token,1,[{t:2399000,p:2399},{t:2400000,p:2400}]);assert.equal(other.seconds,0);
 await assert.rejects(service.recordPassWatch('tester','wrong',first.token,25,[{t:2401000,p:2401}]));await assert.rejects(service.recordPassWatch('tester','auth',first.token,26,[{t:2401000,p:2401}]));
 const scopes=(await engine.query("SELECT scope,stats FROM pass_scopes WHERE user_id='tester'")).rows;assert.equal(scopes.find(s=>s.scope==='season').stats.seconds,2400);assert.equal(scopes.find(s=>s.scope==='week:1').stats.episodes,1);assert.equal(scopes.some(s=>s.scope==='week:2'),false);
 await engine.exec("UPDATE pass_members SET xp=400 WHERE user_id='tester'");await Promise.all([service.claimPass('tester','oni-awakening'),service.claimPass('tester','oni-awakening')]);assert.equal((await engine.query('SELECT count(*)::int n FROM user_cosmetics')).rows[0].n,1);
 const order=await payment.reservePassOrder('tester','oni-awakening');await assert.rejects(payment.reservePassOrder('tester','oni-awakening'));globalThis.passTestTime=end+1000;await service.settlePasses();await payment.confirmPassPayment(order.id,'verified-payment');await payment.confirmPassPayment(order.id,'verified-payment');await service.settlePasses();assert.equal((await engine.query('SELECT count(*)::int n FROM user_cosmetics')).rows[0].n,2);assert.equal((await engine.query('SELECT count(*)::int n FROM pass_claims')).rows[0].n,2);assert.equal((await service.passOverview('tester','oni-awakening')).premium,true);await assert.rejects(payment.reservePassOrder('tester','oni-awakening'));
 }finally{await engine.close();delete globalThis.passTestDb;delete globalThis.passTestTime}
});
