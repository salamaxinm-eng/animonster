import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import test from 'node:test';

const moduleUrl = (source) =>
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const inputUrl = moduleUrl(
  stripTypeScriptTypes(
    await readFile('lib/title-restriction-input.ts', 'utf8'),
  ),
);
const { parseTitleRestrictionLinks } = await import(inputUrl);

void test('links are canonicalised by title; unsafe hosts, paths, credentials and excessive batches are rejected', () => {
  assert.deepEqual(
    parseTitleRestrictionLinks(
      'https://animonster.su/anime/57334\nhttps://animonster.su/anime/57334?episode=1\nhttps://animonster.su/anime/60543',
    ),
    [
      { animeId: 57334, sourceUrl: 'https://animonster.su/anime/57334' },
      { animeId: 60543, sourceUrl: 'https://animonster.su/anime/60543' },
    ],
  );
  assert.deepEqual(
    parseTitleRestrictionLinks(
      'https://www.animonster.su/anime/00057334-name#player /anime/57334 57334',
    ),
    [{ animeId: 57334, sourceUrl: 'https://animonster.su/anime/57334' }],
  );
  for (const value of [
    '',
    null,
    'https://evil.test/anime/21',
    'https://animonster.su.evil.test/anime/21',
    'https://admin@animonster.su/anime/21',
    'https://animonster.su:3000/anime/21',
    'javascript:alert(1)',
    '/vpn',
    '/anime/0',
    '/anime/1000000000',
    Array(102).fill('/anime/21').join('\n'),
  ])
    assert.throws(() => parseTitleRestrictionLinks(value));
});

function adapter(engine) {
  return {
    prepare(query) {
      let values = [];
      const sql = query.replace(/\?/g, () => '$' + values.push(null));
      const statement = {
        bind(...args) {
          values = args;
          return statement;
        },
        async first() {
          return (await engine.query(sql, values)).rows[0] || null;
        },
        async all() {
          return { results: (await engine.query(sql, values)).rows };
        },
        async run() {
          await engine.query(sql, values);
        },
      };
      return statement;
    },
    transaction: (callback) =>
      engine.transaction((tx) => callback(adapter(tx))),
  };
}

const coreUrl = moduleUrl(`
  export class ApiError extends Error { constructor(message,status=400,code='request_failed') { super(message); this.status=status; this.code=code; } }
  export const db = () => globalThis.titleAdminDb;
  export const now = () => Date.now(); export const uid=()=>crypto.randomUUID();
  export const viewer = async () => globalThis.titleAdminViewer;
  export const json = (value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
  export const fail = error => json({error:error.message},error.status||500);
  export const body = request => request.json();
  export const sameOrigin = request => { if(request.headers.get('origin') !== new URL(request.url).origin) throw new ApiError('Bad origin',403); };
`);
const adminUrl = moduleUrl(
  stripTypeScriptTypes(
    await readFile('lib/server/title-restriction-admin.ts', 'utf8'),
  )
    .replace("'./core'", JSON.stringify(coreUrl))
    .replace("'../title-restriction-input'", JSON.stringify(inputUrl)),
);
const admin = await import(adminUrl);
const ruleSource = stripTypeScriptTypes(
  await readFile('lib/server/title-restrictions.ts', 'utf8'),
)
  .replace("'./core'", JSON.stringify(coreUrl))
  .replace("'../title-policy'", JSON.stringify(moduleUrl(stripTypeScriptTypes(await readFile('lib/title-policy.ts','utf8')))))
  .replace(
    "'geoip-country'",
    JSON.stringify(import.meta.resolve('geoip-country')),
  );
const rules = await import(moduleUrl(ruleSource));
const anotherProcessRules = await import(
  moduleUrl(ruleSource + '\n// independent proxy module')
);
const route = await import(
  moduleUrl(
    stripTypeScriptTypes(
      await readFile('app/api/admin/title-restrictions/route.ts', 'utf8'),
    )
      .replace("'@/lib/server/core'", JSON.stringify(coreUrl))
      .replace(
        "'@/lib/server/title-restriction-admin'",
        JSON.stringify(adminUrl),
      ),
  )
);

void test('database-backed admin CRUD applies immediately to both enforcement modules, audits changes and enforces admin access', async () => {
  const engine = new PGlite();
  try {
    await engine.exec(`CREATE TABLE users(id text PRIMARY KEY);
      INSERT INTO users VALUES ('owner');
      CREATE TABLE anime_cache(id integer PRIMARY KEY,data text);
      CREATE TABLE moderation_actions(id text PRIMARY KEY,actor_id text REFERENCES users(id),action text,reason text,metadata text,created_at bigint);`);
    await engine.exec(
      await readFile(
        'migrations/postgres/0057_title_region_restrictions.sql',
        'utf8',
      ),
    );
    globalThis.titleAdminDb = adapter(engine);
    const ru = new Headers({ 'x-animonster-client-ip': '77.88.8.8' });
    for (const id of [60058, 57334, 60543])
      assert.equal(await rules.titleBlocked(ru, id), true);
    assert.equal(await rules.titleBlocked(ru, 21), false);

    const request = (input, origin = 'https://animonster.su') =>
      new Request('https://animonster.su/api/admin/title-restrictions', {
        method: 'POST',
        headers: { origin, 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
    for (const user of [
      null,
      { id: 'owner', role: 'user' },
      { id: 'owner', role: 'moderator' },
    ]) {
      globalThis.titleAdminViewer = user;
      assert.equal(
        (
          await route.GET(
            new Request('https://animonster.su/api/admin/title-restrictions'),
          )
        ).status,
        404,
      );
      assert.equal(
        (await route.POST(request({ action: 'remove', animeId: 60058 })))
          .status,
        404,
      );
    }
    globalThis.titleAdminViewer = { id: 'owner', role: 'admin' };
    assert.equal(
      (
        await route.POST(
          request({ action: 'remove', animeId: 60058 }, 'https://evil.test'),
        )
      ).status,
      403,
    );
    const result = await route.POST(
      request({
        action: 'add',
        links: '/anime/21 /anime/21?episode=3',
        reason: 'Notice 123',
      }),
    );
    assert.equal(result.status, 200);
    assert.equal((await result.json()).count, 1);
    assert.equal(await rules.titleBlocked(ru, 21), true);
    assert.equal(await anotherProcessRules.titleBlocked(ru, 21), true);
    assert.equal(
      await rules.titleBlocked(
        new Headers({ 'x-animonster-client-ip': '8.8.8.8' }),
        21,
      ),
      false,
    );
    const items = await admin.listTitleRestrictions();
    assert.equal(items.length, 4);
    assert.equal(
      items.find((item) => item.anime_id === 21).reason,
      'Notice 123',
    );
    const failed = await route.POST(
      request({ action: 'add', links: '/anime/22 https://evil.test/anime/23' }),
    );
    assert.equal(failed.status, 400);
    assert.equal(await rules.restrictedTitle(22), false);
    assert.equal(
      (await route.POST(request({ action: 'remove', animeId: 21 }))).status,
      200,
    );
    assert.equal(await rules.titleBlocked(ru, 21), false);
    assert.equal(await anotherProcessRules.titleBlocked(ru, 21), false);
    const audit = (
      await engine.query(
        'SELECT action FROM moderation_actions ORDER BY created_at',
      )
    ).rows;
    assert.deepEqual(
      audit.map((row) => row.action),
      ['title.restrict_ru', 'title.unrestrict_ru'],
    );
    await admin.removeTitleRestriction('owner', 60058);
    assert.equal(
      await rules.titleBlocked(ru, 60058),
      false,
      'seeded titles can also be removed',
    );
  } finally {
    await engine.close();
  }
});
