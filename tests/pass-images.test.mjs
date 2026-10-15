import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import sharp from 'sharp';
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const shared = await import(moduleUrl(stripTypeScriptTypes(await readFile('lib/pass-images.ts', 'utf8'))));
const service = await import(moduleUrl(stripTypeScriptTypes(await readFile('lib/server/pass-asset-image.ts', 'utf8')).replace("'sharp'", JSON.stringify(import.meta.resolve('sharp')))));

test('reward derivatives preserve aspect ratio, transparent frame centers and do not enlarge originals', async () => {
  const original = await sharp(Buffer.from('<svg width="1024" height="1024"><rect x="80" y="80" width="864" height="864" fill="none" stroke="#ffbb00" stroke-width="80"/></svg>')).png().toBuffer();
  const source = { data: original, mime: 'image/png', sha256: 'original-hash' };
  const image = await service.resizePassAsset(source, 512);
  assert.equal(image.mime, 'image/webp');
  const {data,info} = await sharp(image.bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width,512); assert.equal(info.height,512);
  assert.equal(data[(256*512+256)*4+3],0); assert.equal(data[3],0);
  assert.equal(data[(256*512+40)*4+3],255);
  const tag = await sharp({create:{width:200,height:60,channels:4,background:'#f9b84a'}}).png().toBuffer();
  const resized = await service.resizePassAsset({...source,data:tag},512);
  const meta = await sharp(resized.bytes).metadata(); assert.equal(meta.width,200); assert.equal(meta.height,60);
  assert.notEqual(image.etag,(await service.resizePassAsset(source,256)).etag);
});

test('simultaneous requests share conversion and cached variants avoid further database reads',async()=>{
  const data=await sharp({create:{width:64,height:64,channels:4,background:'#ffbb00'}}).png().toBuffer();
  let loads=0,active=0,peak=0;
  const cache=service.createPassAssetCache(async id=>{loads++;active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,15));active--;return id==='missing'?null:{data,mime:'image/png',sha256:id};});
  const same=await Promise.all(Array.from({length:12},()=>cache.get('one',256)));
  assert.equal(loads,1);assert.equal(same.filter(r=>r.cache==='MISS').length,1);assert.equal(same.filter(r=>r.cache==='SHARED').length,11);
  assert.equal((await cache.get('one',256)).cache,'HIT');assert.equal(loads,1);
  await Promise.all(['a','b','c','d','e'].map(id=>cache.get(id,512)));assert.ok(peak<=2);
  assert.equal((await cache.get('missing',256)).image,null);
  let failures=0;const retry=service.createPassAssetCache(async()=>{if(++failures===1)throw Error('temporary');return{data,mime:'image/png',sha256:'retry'};});
  await assert.rejects(retry.get('one',256));assert.ok((await retry.get('one',256)).image);
  const small=service.createPassAssetCache(async id=>({data,mime:'image/png',sha256:id}),1);
  assert.equal((await small.get('large',256)).cache,'MISS');assert.equal((await small.get('large',256)).cache,'MISS');
});

test('only battle pass asset URLs use variants; other cosmetic sources remain valid',()=>{
  const asset='/api/battlepass/assets/a471d573-f0f7-4b46-9046-7cd7829df752';
  assert.equal(shared.passImageUrl(asset,256),asset+'?w=256');
  for(const source of ['/rewards/old.png','/api/cosmetic-generator/assets/example','https://example.com/picture.png'])assert.equal(shared.passImageUrl(source,512),source);
});

test('asset route serves sized WebP, conditional cache responses and keeps owner preview private',async()=>{
  const id='a471d573-f0f7-4b46-9046-7cd7829df752';
  const data=await sharp({create:{width:64,height:64,channels:4,background:'#ffaa00'}}).png().toBuffer();
  globalThis.passImageTest={config:{},viewerCalls:0,user:null,data};
  const core=moduleUrl(`export const runtime=()=>globalThis.passImageTest.config; export const viewer=async()=>{globalThis.passImageTest.viewerCalls++;return globalThis.passImageTest.user}; export const db=()=>({prepare(){return{bind(){return this},async first(){return{mime:'image/png',data:globalThis.passImageTest.data,sha256:'fixture'}}}}});`);
  const access=moduleUrl(`export const canViewBattlepass=user=>user?.id===globalThis.passImageTest.config.BATTLEPASS_PREVIEW_USER_ID;`);
  const cacheModule=moduleUrl(stripTypeScriptTypes(await readFile('lib/server/pass-asset-image.ts','utf8')).replace("'sharp'",JSON.stringify(import.meta.resolve('sharp'))));
  let source=stripTypeScriptTypes(await readFile('app/api/battlepass/assets/[id]/route.ts','utf8'));
  source=source.replace("'@/lib/server/core'",JSON.stringify(core)).replace("'@/lib/server/battlepass-access'",JSON.stringify(access)).replace("'@/lib/pass-images'",JSON.stringify(moduleUrl(stripTypeScriptTypes(await readFile('lib/pass-images.ts','utf8'))))).replace("'@/lib/server/pass-asset-image'",JSON.stringify(cacheModule));
  const route=await import(moduleUrl(source));const context={params:Promise.resolve({id})};
  try{
    const request=new Request(`http://localhost/api/battlepass/assets/${id}?w=256`);
    const response=await route.GET(request,context);assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'image/webp');assert.match(response.headers.get('Cache-Control'),/immutable/);assert.equal(globalThis.passImageTest.viewerCalls,0);
    const cached=await route.GET(new Request(request,{headers:{'If-None-Match':response.headers.get('ETag')}}),context);assert.equal(cached.status,304);assert.equal(cached.headers.get('X-AniMonster-Image-Cache'),'HIT');
    assert.equal((await route.GET(new Request(`http://localhost/api/battlepass/assets/${id}?w=9999`),context)).status,400);
    globalThis.passImageTest.config.BATTLEPASS_PREVIEW_USER_ID='owner';
    assert.equal((await route.GET(request,context)).status,404);
    globalThis.passImageTest.user={id:'owner'};const privateResponse=await route.GET(request,context);assert.equal(privateResponse.status,200);assert.equal(privateResponse.headers.get('Cache-Control'),'private,no-store');
    const original=await route.GET(new Request(`http://localhost/api/battlepass/assets/${id}`),context);assert.equal(original.headers.get('Content-Type'),'image/png');assert.deepEqual(Buffer.from(await original.arrayBuffer()),data);
  }finally{delete globalThis.passImageTest;delete globalThis.__passAssetCache}
});
