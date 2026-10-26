import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
const url = (s) =>
  'data:text/javascript;base64,' + Buffer.from(s).toString('base64');
async function load(path, imports = {}) {
  let source = stripTypeScriptTypes(await readFile(path, 'utf8'));
  for (const [a, b] of Object.entries(imports))
    source = source.replaceAll("'" + a + "'", JSON.stringify(b));
  return url(source);
}
const sharedUrl = await load('lib/halloween.ts'),
  shared = await import(sharedUrl);
function database(connection) {
  return {
    prepare(source) {
      let values = [],
        i = 0;
      const sql = source.replace(/\?/g, () => '$' + ++i);
      const execute = () => connection.query(sql, values);
      return {
        bind(...v) {
          values = v;
          return this;
        },
        async first() {
          return (await execute()).rows[0] || null;
        },
        async all() {
          return { results: (await execute()).rows };
        },
        run: execute,
      };
    },
    transaction: (fn) => connection.transaction((tx) => fn(database(tx))),
  };
}
const core =
  url(`export const db=()=>globalThis.huntDb;export const now=()=>globalThis.huntNow;export const uid=()=>crypto.randomUUID();export const cookie=(r,n)=>r.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(n+'='))?.slice(n.length+1)||'';export const hash=async x=>x;
 export class ApiError extends Error{constructor(message,status=400,code='bad_request'){super(message);this.status=status;this.code=code;}}
 export const json=value=>Response.json(value);export const body=r=>r.json();export const fail=e=>Response.json({error:e.message,code:e.code},{status:e.status||500});export const sameOrigin=r=>{if(r.headers.get('origin')!=='https://test.local')throw new ApiError('origin',403)};
 export const viewer=async r=>r.headers.get('x-user')?globalThis.huntDb.prepare('SELECT * FROM users WHERE id=?').bind(r.headers.get('x-user')).first():null;
 export const requireUser=async r=>{const user=await viewer(r);if(!user)throw new ApiError('login',401);return user;};`);
const serviceUrl = await load('lib/server/halloween-hunt.ts', {
    './core': core,
    '../halloween': sharedUrl,
  }),
  service = await import(serviceUrl);
const route = await import(
  await load('app/api/halloween/route.ts', {
    '@/lib/server/core': core,
    '@/lib/server/halloween-hunt': serviceUrl,
  })
);
const req = (user, action, extra = {}, origin = 'https://test.local') =>
  new Request('https://test.local/api/halloween', {
    method: 'POST',
    headers: {
      origin,
      'content-type': 'application/json',
      ...(user ? { 'x-user': user } : {}),
    },
    body: JSON.stringify({ action, userId: user || null, ...extra }),
  });
void test('five distinct spirits grant one permanent cosmetic, isolate accounts, preserve pin and forbid late claims', async () => {
  const engine = new PGlite({ extensions: { pg_trgm } });
  globalThis.huntDb = database(engine);
  globalThis.huntNow = shared.HALLOWEEN_START + 10000;
  try {
    for (const file of (await readdir('migrations/postgres'))
      .filter((n) => n.endsWith('.sql'))
      .sort())
      await engine.exec(await readFile('migrations/postgres/' + file, 'utf8'));
    await engine.exec(
      "INSERT INTO users(id,identity,nick,created_at,pin) VALUES ('alice','vk:alice','Alice',1,'founder-001'),('bob','vk:bob','Bob',1,NULL)",
    );
    await assert.rejects(service.findHalloweenSpirit('alice', 'invented'), {
      status: 400,
    });
    assert.equal(
      (await route.POST(req(null, 'find', { spirit: 'home' }))).status,
      401,
    );
    assert.equal(
      (
        await route.POST(
          req('alice', 'find', { spirit: 'home', userId: 'bob' }),
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await route.POST(
          req('alice', 'find', { spirit: 'home' }, 'https://evil.invalid'),
        )
      ).status,
      403,
    );
    for (const id of shared.HALLOWEEN_SPIRITS) {
      assert.equal(
        (await route.POST(req('alice', 'find', { spirit: id }))).status,
        200,
      );
      await service.findHalloweenSpirit('alice', id);
    }
    const state = await service.halloweenHuntState('alice', 'user:alice');
    assert.equal(state.found.length, 5);
    assert.equal(state.awarded, true);
    await Promise.all([
      service.findHalloweenSpirit('alice', 'home'),
      service.findHalloweenSpirit('alice', 'player'),
    ]);
    assert.equal(
      (await engine.query('SELECT count(*)::integer n FROM user_cosmetics'))
        .rows[0].n,
      1,
    );
    assert.equal(
      (await engine.query("SELECT pin FROM users WHERE id='alice'")).rows[0]
        .pin,
      'founder-001',
    );
    assert.equal(
      (await engine.query('SELECT count(*)::integer n FROM grants')).rows[0].n,
      0,
      'no subscription/fake payment is granted',
    );
    assert.deepEqual(
      (await service.halloweenHuntState('bob', 'user:bob')).found,
      [],
    );
    const hello = await route.GET(
      new Request('https://test.local/api/halloween'),
    );
    const token = hello.headers
      .get('set-cookie')
      .match(/am_hw_guest=([^;]+)/)[1];
    const guestCandle = () =>
      route.POST(
        new Request('https://test.local/api/halloween', {
          method: 'POST',
          headers: {
            origin: 'https://test.local',
            'content-type': 'application/json',
            cookie: 'am_hw_guest=' + token,
          },
          body: JSON.stringify({
            action: 'candle',
            userId: null,
            actor: 'user:alice',
          }),
        }),
      );
    assert.equal((await guestCandle()).status, 200);
    assert.equal((await guestCandle()).status, 409);
    assert.equal(
      (await service.halloweenHuntState('alice', 'user:alice')).candleUsed,
      false,
      'client-supplied actor cannot consume another account candle',
    );
    globalThis.huntNow = shared.HALLOWEEN_END;
    await assert.rejects(service.findHalloweenSpirit('bob', 'home'), {
      status: 410,
    });
    assert.equal(
      (await service.halloweenHuntState('alice', 'user:alice')).awarded,
      true,
      'cosmetic survives event expiry',
    );
  } finally {
    await engine.close();
    delete globalThis.huntDb;
  }
});
void test('candle is atomic once per actor/day, works for guests and users, and rejects expired event', async () => {
  const engine = new PGlite();
  globalThis.huntDb = database(engine);
  globalThis.huntNow = shared.HALLOWEEN_START + 1000;
  try {
    await engine.exec(
      'CREATE TABLE halloween_candle_uses(actor text NOT NULL,day date NOT NULL,used_at bigint NOT NULL,PRIMARY KEY(actor,day))',
    );
    const results = await Promise.allSettled([
      service.activateHalloweenCandle('guest:one'),
      service.activateHalloweenCandle('guest:one'),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(
      results.find((r) => r.status === 'rejected').reason.code,
      'candle_used',
    );
    await assert.rejects(service.activateHalloweenCandle('guest:one'), {
      status: 409,
    });
    await service.activateHalloweenCandle('user:alice');
    globalThis.huntNow += 86400000;
    await service.activateHalloweenCandle('guest:one');
    assert.equal(
      (
        await engine.query(
          'SELECT count(*)::integer n FROM halloween_candle_uses',
        )
      ).rows[0].n,
      3,
    );
    await service.activateHalloweenCandle('user:bob', 'guest:shared');
    await assert.rejects(service.activateHalloweenCandle('guest:shared'), {
      status: 409,
    });
    await assert.rejects(
      service.activateHalloweenCandle('user:bob', 'guest:new-device'),
      { status: 409 },
    );
    assert.equal(
      (
        await engine.query(
          "SELECT count(*)::integer n FROM halloween_candle_uses WHERE actor='guest:new-device'",
        )
      ).rows[0].n,
      0,
      'failed paired claim rolls back its device row',
    );
    globalThis.huntNow = shared.HALLOWEEN_END;
    await assert.rejects(service.activateHalloweenCandle('guest:one'), {
      status: 410,
    });
  } finally {
    await engine.close();
    delete globalThis.huntDb;
  }
});
void test('search trigger is exact and horror selection never accepts unrelated or invalid catalog entries', () => {
  for (const query of ['Тыква', '  ХЭЛЛОУИН ', 'Хеллоуин'])
    assert.equal(shared.halloweenQuery(query), true);
  for (const query of ['Тыква и друзья', 'Моя тыква', 'Naruto', ''])
    assert.equal(shared.halloweenQuery(query), false);
  assert.deepEqual(
    shared
      .horrorCandidates([
        { id: 1, genres: ['Ужасы'] },
        { id: 2, genres: ['Horror'] },
        { id: 3, genres: ['Комедия'] },
        { id: 4 },
        { id: -1, genres: ['Ужасы'] },
      ])
      .map((item) => item.id),
    [1, 2],
  );
});
