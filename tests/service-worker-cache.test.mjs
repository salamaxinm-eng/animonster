import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const origin = 'https://animonster.su';

function harness(respond) {
  const listeners = new Map();
  const stores = new Map();
  const calls = [];
  const key = (request) =>
    new URL(typeof request === 'string' ? request : request.url, origin).href;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async match(request) { return entries.get(key(request))?.clone(); },
        async put(request, response) { entries.set(key(request), response.clone()); },
        async delete(request) { return entries.delete(key(request)); },
        async keys() { return [...entries.keys()].map((url) => ({ url })); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  const self = {
    location: { origin },
    clients: { claim: async () => {} },
    skipWaiting: async () => {},
    addEventListener(name, callback) { listeners.set(name, callback); },
  };
  vm.runInNewContext(source, {
    self, caches, URL, Date, Set, Number, Promise, Response,
    fetch: async (request) => {
      calls.push(key(request));
      return respond(key(request));
    },
  });
  async function dispatch(name, request, extra = {}) {
    let response;
    const pending = [];
    listeners.get(name)({
      request,
      ...extra,
      respondWith(value) { response = value; },
      waitUntil(value) { pending.push(value); },
    });
    const result = await Promise.resolve(response);
    await Promise.all(pending);
    return result;
  }
  return { caches, stores, calls, dispatch };
}

const request = (path, mode = 'cors', cache = 'default') => ({
  url: origin + path, method: 'GET', mode, cache,
});
const response = (body, type, policy = 'public, max-age=30') =>
  new Response(body, {
    headers: {
      'Content-Type': type,
      'Cache-Control': policy,
      Date: new Date().toUTCString(),
    },
  });

test('new worker replaces broad old cache and never stores private pages or APIs', async () => {
  const app = harness((url) =>
    response(url, 'text/html', 's-maxage=31536000'));
  const old = await app.caches.open('animonster-shell-v2');
  await old.put('/profile', response('private profile', 'text/html'));
  await app.dispatch('install');
  await app.dispatch('activate');
  assert.equal(app.stores.has('animonster-shell-v2'), false);
  assert.equal(await app.dispatch('fetch', request('/profile', 'navigate')), undefined);
  assert.equal(await app.dispatch('fetch', request('/vpn', 'navigate')), undefined);
  assert.equal(await app.dispatch('fetch', request('/api/community')), undefined);
  assert.equal(await app.dispatch('fetch', request('/api/recommendations')), undefined);
  assert.equal(await app.dispatch('fetch', request('/api/vpn')), undefined);
  assert.equal(await app.dispatch('fetch', request('/api/avatar/1', 'no-cors')), undefined);
});

test('public shell and catalogue repeat from cache while explicit no-store bypasses it', async () => {
  const app = harness((url) =>
    url.includes('/api/')
      ? response('[]', 'application/json')
      : response('public shell', 'text/html', 's-maxage=31536000'));
  await app.dispatch('install');
  await app.dispatch('activate');
  const beforeHome = app.calls.length;
  assert.equal((await app.dispatch('fetch', request('/', 'navigate'))).status, 200);
  assert.equal(app.calls.length, beforeHome + 1); // background refresh
  const catalog = request('/api/catalog?sort=rating');
  assert.equal((await app.dispatch('fetch', catalog)).status, 200);
  const beforeRepeat = app.calls.length;
  assert.equal((await app.dispatch('fetch', catalog)).status, 200);
  assert.equal(app.calls.length, beforeRepeat);
  assert.equal(await app.dispatch('fetch', request('/api/catalog?sort=rating', 'cors', 'no-store')), undefined);
});

test('responses marked private or no-store cannot enter the public data cache', async () => {
  const app = harness(() =>
    response('secret', 'application/json', 'private, no-store'));
  await app.dispatch('fetch', request('/api/popular'));
  await app.dispatch('fetch', request('/api/popular'));
  assert.equal(app.calls.length, 2);
  assert.equal(app.stores.get('animonster-public-data-v1').size, 0);
});

test('public shell allowlist still rejects a private HTML response', async () => {
  const app = harness(() => response('account data', 'text/html', 'private, no-store'));
  await app.dispatch('install');
  const shell = await app.caches.open('animonster-shell-v5-eclipse-garden');
  assert.equal(await shell.match('/'), undefined);
  assert.equal((await app.dispatch('fetch', request('/', 'navigate'))).status, 200);
  assert.equal(await shell.match('/'), undefined);
});

void test('a downloaded episode opens by query-string URL after an offline cold start', async()=>{
 let connected=true;
 const app=harness((url)=>{if(!connected)throw new Error('offline');return response('offline shell','text/html',url===origin+'/'?'private, no-store':'public, max-age=30');});
 await app.dispatch('install');await app.dispatch('activate');connected=false;
 const result=await app.dispatch('fetch',request('/downloads/watch?id=demo-1-anistar-720','navigate'));
 assert.equal(result.status,200);assert.equal(await result.text(),'offline shell');
 const home=await app.dispatch('fetch',request('/','navigate'));
 assert.equal(home.status,302);assert.equal(home.headers.get('location'),origin+'/downloads');
 assert.equal(await app.dispatch('fetch',request('/profile?id=private','navigate')),undefined);
});

void test('download preparation repairs missing offline shells and refuses private responses', async () => {
  let connected = false;
  const app = harness(() => {
    if (!connected) throw new Error('offline');
    return response('recovered offline shell', 'text/html');
  });
  await app.dispatch('install');
  connected = true;
  let reply;
  await app.dispatch('message', undefined, { data: { type: 'AM_PREPARE_OFFLINE' }, ports: [{ postMessage(value) { reply = value; } }] });
  assert.equal(reply.ok, true);
  connected = false;
  assert.equal((await app.dispatch('fetch', request('/downloads/watch?id=demo-2', 'navigate'))).status, 200);
  const empty = harness(() => response('account info', 'text/html', 'private, no-store'));
  await empty.dispatch('message', undefined, { data: { type: 'AM_PREPARE_OFFLINE' }, ports: [{ postMessage(value) { reply = value; } }] });
  assert.equal(reply.ok, false);
  const missingAsset = harness((url) => {
    if (url.endsWith('.js')) throw new Error('asset unavailable');
    return response('<script src="/_next/static/offline.js"></script>', 'text/html');
  });
  await missingAsset.dispatch('message', undefined, { data: { type: 'AM_PREPARE_OFFLINE' }, ports: [{ postMessage(value) { reply = value; } }] });
  assert.equal(reply.ok, false);
});
