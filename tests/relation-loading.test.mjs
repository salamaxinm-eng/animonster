import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test, after } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
const url = (code) =>
  'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const load = async (path) => stripTypeScriptTypes(await readFile(path, 'utf8'));
const engine = new PGlite();
await engine.exec(
  `CREATE TABLE anime_cache(id integer PRIMARY KEY,data text NOT NULL); INSERT INTO anime_cache SELECT id,json_build_object('id',id,'russian','Title '||id,'kind','tv','aired_on','2010-01-01')::text FROM generate_series(1,2000) AS id;`,
);
await engine.exec(
  await readFile('migrations/postgres/0014_anime_relations.sql', 'utf8'),
);
await engine.exec(
  `INSERT INTO anime_relations(anime_id,related_anime_id,relation,checked_at) VALUES (1,2,'Sequel',0),(2,3,'Sequel',0),(1,4,'Spin-off',0);`,
);
let clock = 1800000000000,
  readRows = 0,
  repairs = 0;
function db(connection) {
  return {
    prepare(source) {
      let index = 0,
        values = [];
      const sql = source.replace(/\?/g, () => '$' + ++index);
      const execute = () => connection.query(sql, values);
      return {
        bind(...params) {
          values = params;
          return this;
        },
        async all() {
          const rows = (await execute()).rows;
          if (source.includes('SELECT id,data FROM anime_cache'))
            readRows += rows.length;
          return { results: rows };
        },
        async first() {
          return (await execute()).rows[0] ?? null;
        },
        run: execute,
      };
    },
    transaction(callback) {
      return connection.transaction((tx) => callback(db(tx)));
    },
  };
}
globalThis.relationLoading = {
  db: db(engine),
  now: () => clock,
  repair: (items) => {
    repairs++;
    return items;
  },
};
const source = (await load('lib/server/anime-relations.ts'))
  .replace(
    "'./core'",
    JSON.stringify(
      url(
        'export const db=()=>globalThis.relationLoading.db;export const now=()=>globalThis.relationLoading.now();',
      ),
    ),
  )
  .replace(
    "'./anime'",
    JSON.stringify(url('export const compactAnime=items=>items;')),
  )
  .replace(
    "'./relation-graph'",
    JSON.stringify(url(await load('lib/server/relation-graph.ts'))),
  )
  .replace(
    "'./search-metadata'",
    JSON.stringify(
      url(
        'export const canonicalizeAnimeIdentities=async items=>globalThis.relationLoading.repair(items);',
      ),
    ),
  );
const api = await import(url(source));
const request = await import(url(await load('lib/relation-request.ts')));
const originalFetch = globalThis.fetch;
after(async () => {
  globalThis.fetch = originalFetch;
  delete globalThis.relationLoading;
  await engine.close();
});

void test('cached franchise returns without external I/O or deserializing the whole catalogue', async () => {
  let fetches = 0;
  globalThis.fetch = async () => {
    fetches++;
    return new Promise(() => {});
  };
  readRows = 0;
  const result = await Promise.race([
    api.animeRelations(1),
    new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(new Error('Cached relations waited for an upstream request')),
        250,
      ),
    ),
  ]);
  assert.deepEqual(
    result.mainline.map((card) => card.item.id),
    [1, 2, 3],
  );
  assert.equal(result.related[0].item.id, 4);
  assert.equal(result.refreshing, true);
  assert.equal(fetches, 0);
  assert.equal(repairs, 0);
  assert.equal(readRows, 4);
});

void test('simultaneous background refreshes share work while cached cards remain available', async () => {
  const calls = [];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  globalThis.fetch = async (path) => {
    const id = Number(/animes\/(\d+)/.exec(path)[1]);
    calls.push(id);
    if (id === 1) await gate;
    const entries =
      id === 1
        ? [
            { relation: 'Sequel', anime: { id: 2 } },
            { relation: 'Spin-off', anime: { id: 4 } },
          ]
        : id === 2
          ? [
              { relation: 'Prequel', anime: { id: 1 } },
              { relation: 'Sequel', anime: { id: 3 } },
            ]
          : [{ relation: 'Prequel', anime: { id: 2 } }];
    return Response.json(entries);
  };
  const first = api.refreshFranchiseRelations(1),
    second = api.refreshFranchiseRelations(1);
  for (let count = 0; count < 30 && !calls.length; count++)
    await new Promise((resolve) => setTimeout(resolve, 2));
  const cached = await api.animeRelations(1);
  assert.equal(cached.mainline.length, 3);
  assert.equal(cached.refreshing, true);
  release();
  await Promise.all([first, second]);
  assert.deepEqual(calls, [1, 2, 3]);
  assert.equal(repairs, 1);
  assert.equal((await api.animeRelations(1)).refreshing, false);
});

void test('outages, malformed payloads and failed database writes preserve saved seasons and back off', async () => {
  const before = (
    await engine.query(
      'SELECT anime_id,related_anime_id,relation FROM anime_relations ORDER BY 1,2,3',
    )
  ).rows;
  for (const failure of ['http', 'payload', 'database']) {
    await engine.exec(
      "UPDATE anime_relation_state SET status='pending' WHERE anime_id=1",
    );
    globalThis.fetch = async () =>
      failure === 'http'
        ? new Response('', { status: 503 })
        : Response.json(
            failure === 'payload'
              ? { error: 'unavailable' }
              : [
                  { relation: 'Sequel', anime: { id: 2 } },
                  { relation: 'Sequel', anime: { id: 2147483648 } },
                ],
          );
    await api.refreshFranchiseRelations(1);
    assert.deepEqual(
      (
        await engine.query(
          'SELECT anime_id,related_anime_id,relation FROM anime_relations ORDER BY 1,2,3',
        )
      ).rows,
      before,
    );
    assert.equal((await api.animeRelations(1)).refreshing, false);
  }
  clock += 16 * 60000;
  assert.equal((await api.animeRelations(1)).refreshing, true);
});

void test('relation requests finish on timeout, cancel on navigation and reject malformed responses', async () => {
  globalThis.fetch = async (_url, { signal }) =>
    new Promise((_, reject) => {
      const abort = () => reject(new DOMException('Cancelled', 'AbortError'));
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
    });
  await assert.rejects(
    request.requestAnimeRelations(1, new AbortController().signal, false, 20),
    (error) => error.name === 'AbortError',
  );
  const controller = new AbortController(),
    pending = request.requestAnimeRelations(1, controller.signal, false, 1000);
  controller.abort();
  await assert.rejects(pending, (error) => error.name === 'AbortError');
  globalThis.fetch = async () =>
    Response.json({ mainline: {}, branches: [], related: [] });
  await assert.rejects(
    request.requestAnimeRelations(1, new AbortController().signal),
    /Invalid relations/,
  );
  let cache;
  globalThis.fetch = async (_url, options) => {
    cache = options.cache;
    return Response.json({
      mainline: [],
      branches: [],
      related: [],
      refreshing: true,
    });
  };
  assert.equal(
    (await request.requestAnimeRelations(1, new AbortController().signal, true))
      .refreshing,
    true,
  );
  assert.equal(cache, 'no-store');
});
