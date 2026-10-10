import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
const moduleUrl = (source) => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
test('VPN promo reserves once, confirms once, releases cancellation and survives refund', async () => {
  const engine=new PGlite();
  const client=(connection)=>({prepare(source){let values=[];let i=0;const sql=source.replace(/\?/g,()=>'$'+ ++i);return {
    bind(...v){values=v;return this;},async first(){return (await connection.query(sql,values)).rows[0]||null;},async run(){return connection.query(sql,values);}
  };},transaction(fn){return connection.transaction(tx=>fn(client(tx)));}});
  globalThis.promoTestDb=client(engine);
  try {
    await engine.exec(`CREATE TABLE users(id text PRIMARY KEY); INSERT INTO users VALUES ('one'),('two');
      CREATE TABLE orders(id text PRIMARY KEY,user_id text,created_at bigint,provider text,plan text,
      amount numeric,duration_days integer,status text DEFAULT 'pending',confirmed_at bigint,provider_id text);`);
    await engine.exec(await readFile('migrations/postgres/0046_vpn_promo.sql','utf8'));
    const core=moduleUrl(`export const db=()=>globalThis.promoTestDb;export const now=()=>Date.now();export const uid=()=>crypto.randomUUID();export class ApiError extends Error{}`);
    const source=stripTypeScriptTypes(await readFile('lib/server/payment-promotions.ts','utf8'))
      .replace("'./core'",JSON.stringify(core)).replace("'@/lib/vpn-plan'",JSON.stringify(moduleUrl("export const VPN_PLAN={id:'vpn',price:'149.00'}")));
    const promo=await import(moduleUrl(source));
    await assert.rejects(promo.quotePromotion('one','animonster30','vpn'));
    await engine.query("UPDATE payment_promotions SET enabled=true,starts_at=$1,expires_at=$2",[Date.now()-1000,Date.now()+86400000]);
    assert.equal((await promo.quotePromotion('one',' ANIMONSTER30 ','vpn')).amount,104.3);
    await assert.rejects(promo.quotePromotion('one','animonster30','vpn_plus'));
    await assert.rejects(promo.quotePromotion('one','wrong','vpn'));
    const order=await promo.reservePromotion('one','animonster30','vpn');
    await assert.rejects(promo.reservePromotion('one','animonster30','vpn'));
    await engine.query("UPDATE orders SET payment_url='https://example.com/payment' WHERE id=$1",[order.id]);
    const results=await Promise.all([promo.reservePromotion('one','animonster30','vpn'),promo.reservePromotion('one','animonster30','vpn')]);
    assert.equal(results[0].id,order.id);assert.equal(results[1].id,order.id);
    await engine.query("UPDATE orders SET status='canceled' WHERE id=$1",[order.id]);
    const retry=await promo.reservePromotion('one','animonster30','vpn');
    await engine.query("UPDATE orders SET status='succeeded',confirmed_at=$1 WHERE id=$2",[Date.now(),retry.id]);
    await engine.query("UPDATE orders SET status='succeeded' WHERE id=$1",[retry.id]);
    await assert.rejects(promo.quotePromotion('one','animonster30','vpn'));
    await engine.query("UPDATE orders SET status='chargebacked' WHERE id=$1",[retry.id]);
    await assert.rejects(promo.reservePromotion('one','animonster30','vpn'));
    let creations=0;
    globalThis.promoTestPayment=async (_path,init)=>{creations++;assert.equal(JSON.parse(init.body).paymentDetails.amount,104.3);
      return {transactionId:'provider-id-123',url:'https://example.com/checkout'};};
    const apiCore=moduleUrl(`export const db=()=>globalThis.promoTestDb;export const now=()=>Date.now();export const uid=()=>crypto.randomUUID();
      export const requireUser=async()=>({id:'two',identity:'vk:two'});export const sameOrigin=()=>{};export const body=r=>r.json();
      export const runtime=()=>({PAYMENTS_ENABLED:'true',PLATEGA_MERCHANT_ID:'test',PLATEGA_SECRET_KEY:'test',SITE_URL:'https://example.com'});
      export const json=v=>Response.json(v);export const fail=e=>Response.json({error:e.message},{status:400});export class ApiError extends Error{}`);
    const imports={
      '@/lib/server/core':apiCore,
      '@/lib/server/billing':moduleUrl('export const paymentFetch=(...args)=>globalThis.promoTestPayment(...args);export const verifyPayment=async()=>"pending";'),
      '@/lib/server/fundraising':moduleUrl('export const requireActiveFundraisingGoal=async()=>null;'),
      '@/lib/fundraising':moduleUrl('export const DONATION_PLAN="donation",DONATION_MIN_AMOUNT=150;export const donationAmount=()=>null;'),
      '@/lib/vpn-plan':moduleUrl('export const VPN_PLAN={id:"vpn",price:"149.00",days:30,label:"VPN"},VPN_PLUS_PLAN={id:"vpn_plus"};'),
      '@/lib/server/vpn':moduleUrl('export const vpnPurchaseAvailable=()=>true,vpnBundlePurchaseAvailable=()=>true;'),
      '@/lib/subscription-plans':moduleUrl('export const SUPPORT_MIN_AMOUNT=150,SUPPORT_PLAN="support";export const subscriptionPlan=()=>null,supportAmount=()=>null;'),
      '@/lib/server/payment-promotions':moduleUrl(source),
    };
    let checkoutSource=stripTypeScriptTypes(await readFile('app/api/payments/route.ts','utf8'));
    for(const [name,target] of Object.entries(imports))checkoutSource=checkoutSource.replaceAll("'"+name+"'",JSON.stringify(target));
    const checkout=await import(moduleUrl(checkoutSource));
    const request=()=>new Request('https://example.com/api/payments',{method:'POST',body:JSON.stringify({plan:'vpn',promoCode:'animonster30',amount:1})});
    const result=await checkout.POST(request());assert.equal(result.status,200,await result.text());
    assert.equal((await checkout.POST(request())).status,200);
    assert.equal(creations,1);
    assert.equal(Number((await engine.query("SELECT amount FROM orders WHERE user_id='two'")).rows[0].amount),104.3);
    await engine.query('UPDATE payment_promotions SET expires_at=$1',[Date.now()-1]);
    await assert.rejects(promo.quotePromotion('two','animonster30','vpn'));
  } finally {await engine.close();delete globalThis.promoTestDb;}
});
