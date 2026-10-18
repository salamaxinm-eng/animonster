import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
const url = (s) =>
  'data:text/javascript;base64,' + Buffer.from(s).toString('base64');
const pureUrl = url(
  stripTypeScriptTypes(await readFile('lib/anime-taxonomy.ts', 'utf8')),
);
const { partitionTags, tagKey } = await import(pureUrl);
const engine = new PGlite();
await engine.exec(`CREATE TABLE catalog_page_cache(cache_key text PRIMARY KEY,data text,updated_at bigint);
CREATE TABLE anime_search_metadata(themes jsonb);
CREATE TABLE anime_themes_cache(themes text,status text);
CREATE TABLE anime_cache(data text,genres_index jsonb);`);
let time = 1800000000000;
const database = {
  prepare(source) {
    let i = 0,
      values = [];
    const sql = source.replace(/\?/g, () => '$' + ++i);
    const query = () => engine.query(sql, values);
    return {
      bind(...v) {
        values = v;
        return this;
      },
      run: query,
      async first() {
        return (await query()).rows[0];
      },
      async all() {
        return { results: (await query()).rows };
      },
    };
  },
};
globalThis.__taxonomyTest = { database, now: () => time };
const coreUrl = url(
  'export const db=()=>globalThis.__taxonomyTest.database; export const now=()=>globalThis.__taxonomyTest.now();',
);
const source = stripTypeScriptTypes(
  await readFile('lib/server/anime-taxonomy.ts', 'utf8'),
)
  .replace("'./core'", JSON.stringify(coreUrl))
  .replace("'@/lib/anime-taxonomy'", JSON.stringify(pureUrl));
let revision = 0;
async function load() {
  const moduleUrl = url(source + '\n// instance ' + ++revision);
  return { module: await import(moduleUrl), moduleUrl };
}
const entries = [
  { id: '1', russian: 'Драма', kind: 'genre' },
  { id: '2', russian: 'Фэнтези', kind: 'genre' },
  { id: '3', russian: 'Исекай', kind: 'theme' },
  { id: '4', russian: 'Путешествие во времени', kind: 'theme' },
  { id: '5', russian: 'Сёнен', kind: 'demographic' },
];
await test('tags normalize case, whitespace and е/ё while preserving unknown genres', () => {
  assert.equal(tagKey('Исэкай'), tagKey('Исекай'));
  const result = partitionTags(
    [' Драма ', 'драма', ' ИСЕКАЙ ', 'Сенен', 'Сёнен', 'Неизвестное'],
    ['Исекай'],
  );
  assert.deepEqual(result, {
    genres: ['Драма', 'Сенен', 'Неизвестное'],
    themes: ['ИСЕКАЙ'],
  });
});
await test('canonical catalogue is persisted and indexed themes are deduplicated without moving demographics', async (t) => {
  await engine.query('INSERT INTO anime_search_metadata(themes) VALUES($1)', [
    JSON.stringify([' исекай ', 'Психологическое', 'Сенен']),
  ]);
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ data: { genres: entries } }),
  );
  const { module } = await load();
  const result = await module.animeTaxonomy();
  assert.deepEqual(
    new Set(result.themes),
    new Set(['Исекай', 'Путешествие во времени', 'Психологическое']),
  );
  assert.equal(
    (await engine.query('SELECT * FROM catalog_page_cache')).rows.length,
    1,
  );
  const filtered = await module.genreEntries([
    { name: 'Драма', id: 1 },
    { name: 'ИСЕКАЙ', id: 2 },
    { name: 'Сёнен', id: 3 },
    { name: 'драма', id: 4 },
    { name: 'Неизвестное', id: 5 },
  ]);
  assert.deepEqual(
    filtered.map((x) => x.id),
    [1, 3, 5],
  );
});
await test('process restart uses durable catalogue without upstream request; outage retains last catalogue', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('offline');
  });
  let { module } = await load();
  assert.equal((await module.animeTaxonomy()).themes.includes('Исекай'), true);
  time += 7 * 60 * 60 * 1000;
  ({ module } = await load());
  assert.equal(
    (await module.animeTaxonomy()).themes.includes('Путешествие во времени'),
    true,
  );
});
await test('without a saved catalogue, indexed themes remain usable and unknown labels stay genres', async (t) => {
  await engine.exec('DELETE FROM catalog_page_cache');
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('offline');
  });
  const { module } = await load();
  const { themes } = await module.animeTaxonomy();
  assert.ok(themes.some((x) => tagKey(x) === 'исекай'));
  assert.deepEqual(
    (
      await module.genreEntries([{ name: 'Исекай' }, { name: 'Неизвестное' }])
    ).map((x) => x.name),
    ['Неизвестное'],
  );
});
await test('facets API keeps genres and themes disjoint with the existing response shape', async (t) => {
  await engine.query(
    'INSERT INTO anime_cache(data,genres_index) VALUES($1,$2)',
    [
      JSON.stringify({ genres: ['Драма', 'Исекай'] }),
      JSON.stringify(['Драма', 'Исекай', 'Фэнтези', 'Сёнен']),
    ],
  );
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ data: { genres: entries } }),
  );
  const { moduleUrl } = await load();
  const route = stripTypeScriptTypes(
    await readFile('app/api/search/facets/route.ts', 'utf8'),
  )
    .replace("'@/lib/server/core'", JSON.stringify(coreUrl))
    .replace("'@/lib/server/anime-taxonomy'", JSON.stringify(moduleUrl))
    .replace("'@/lib/anime-taxonomy'", JSON.stringify(pureUrl));
  const { GET } = await import(url(route));
  const r = await GET();
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.deepEqual(body.genres, ['Драма', 'Сёнен', 'Фэнтези']);
  assert.ok(body.themes.includes('Исекай'));
  assert.ok(body.kinds.length && body.statuses.length);
  assert.ok(
    body.genres.every((g) => !body.themes.some((t) => tagKey(t) === tagKey(g))),
  );
});
await engine.close();
delete globalThis.__taxonomyTest;
