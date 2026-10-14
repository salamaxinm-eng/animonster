import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import sharp from 'sharp';
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
async function module(file,replacements){let s=stripTypeScriptTypes(await readFile(file,'utf8'));for(const [from,to] of replacements)s=s.replaceAll("'"+from+"'",JSON.stringify(to));return url(s);}
const core=url('export class ApiError extends Error {constructor(message,status=400){super(message);this.status=status}};export const fail=e=>Response.json({error:e.message},{status:e.status||500});');
const images=await module('lib/server/images.ts',[['./core',core]]);
const optimized=await module('lib/server/optimized-image.ts',[['sharp',import.meta.resolve('sharp')]]);
const route=await import(await module('app/api/image/route.ts',[['@/lib/server/core',core],['@/lib/server/images',images],['@/lib/server/optimized-image',optimized]]));

test('image gateway shares downloads, caches resized WebP, preserves transparency and validates variants and redirects',async()=>{
 const originalFetch=globalThis.fetch;
 const bytes=await sharp({create:{width:960,height:1440,channels:4,background:{r:80,g:170,b:200,alpha:.5}}}).png().toBuffer();
 let calls=0;
 globalThis.fetch=async()=>{calls++;await new Promise(r=>setTimeout(r,20));return new Response(bytes,{headers:{'Content-Type':'image/png','Content-Length':String(bytes.length)}})};
 const request=(source='https://desu.shikimori.one/uploads/test.png',width=480)=>new Request('https://animonster.su/api/image?url='+encodeURIComponent(source)+'&w='+width);
 try{
  const responses=await Promise.all(Array.from({length:12},()=>route.GET(request())));
  assert.equal(calls,1);
  for(const response of responses){assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/webp');const meta=await sharp(Buffer.from(await response.arrayBuffer())).metadata();assert.equal(meta.width,480);assert.equal(meta.height,720);assert.equal(meta.hasAlpha,true);}
  assert.equal((await route.GET(request())).headers.get('x-animonster-image-cache'),'HIT');assert.equal(calls,1);
  const small=await route.GET(request(undefined,240));assert.equal((await sharp(Buffer.from(await small.arrayBuffer())).metadata()).width,240);assert.equal(calls,2);
  assert.equal((await route.GET(request(undefined,500))).status,400);assert.equal(calls,2);
  assert.equal((await route.GET(request('https://127.0.0.1/private'))).status,400);assert.equal(calls,2);
  globalThis.fetch=async()=>{calls++;return new Response(null,{status:302,headers:{Location:'http://127.0.0.1/private'}})};
  assert.equal((await route.GET(request('https://shikimori.one/redirect'))).status,400);assert.equal(calls,3);
  globalThis.fetch=async()=>{calls++;return new Response(null,{status:503})};
  assert.equal((await route.GET(request('https://shikimori.one/retry'))).status,502);
  globalThis.fetch=async()=>{calls++;return new Response(bytes,{headers:{'Content-Type':'image/png'}})};
  assert.equal((await route.GET(request('https://shikimori.one/retry'))).status,200);assert.equal(calls,5);
 }finally{globalThis.fetch=originalFetch;delete globalThis.__animonsterImageCache;}
});
