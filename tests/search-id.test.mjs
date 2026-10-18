import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';

const url = (source) =>
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const engine = new PGlite({ extensions: { pg_trgm } });
await engine.exec(`CREATE EXTENSION pg_trgm;
  CREATE TABLE anime_cache(id integer PRIMARY KEY,data text,score_index float,year_index integer,genres_index jsonb,kind_index text,status_index text);
  CREATE TABLE anime_search_metadata(anime_id integer PRIMARY KEY,normalized_titles text,normalized_aliases text[],themes jsonb);
  CREATE TABLE anime_themes_cache(anime_id integer PRIMARY KEY,themes text);
`);
const database = {
  prepare(source) {
    let index = 0,
      values = [];
    const sql = source.replace(/\?/g, () => '$' + ++index);
    const query = () => engine.query(sql, values);
    return {
      bind(...args) {
        values = args;
        return this;
      },
      async all() {
        return { results: (await query()).rows };
      },
      async first() {
        return (await query()).rows[0];
      },
    };
  },
};
let groupedCalls = 0;
globalThis.__searchIdTest = {
  database,
  group: async (items) => {
    groupedCalls++;
    return { groups: [], standalone: items };
  },
};
let source = stripTypeScriptTypes(
  await readFile(new URL('../lib/server/search.ts', import.meta.url), 'utf8'),
);
const replacements = {
  './core': url('export const db=()=>globalThis.__searchIdTest.database;'),
  './anime': url('export const compactAnime=items=>items;'),
  './shikimori-matching': url(
    stripTypeScriptTypes(
      await readFile(
        new URL('../lib/server/shikimori-matching.ts', import.meta.url),
        'utf8',
      ),
    ),
  ),
  './anime-relations': url(
    'export const groupSearchAnime=items=>globalThis.__searchIdTest.group(items);',
  ),
  './search-metadata': url(
    'export const canonicalizeAnimeIdentities=async items=>items;',
  ),
};
for (const [name, replacement] of Object.entries(replacements))
  source = source.replaceAll(`'${name}'`, JSON.stringify(replacement));
const { searchAnime } = await import(url(source));
async function seed(id, title, extra = {}) {
  const item = {
    id,
    russian: title,
    name: title,
    kind: 'tv',
    aired_on: '2013',
    ...extra,
  };
  await engine.query('INSERT INTO anime_cache VALUES($1,$2,$3,2013,$4,$5,$6)', [
    id,
    JSON.stringify(item),
    extra.score || 8,
    JSON.stringify(extra.genres || ['Action']),
    item.kind,
    extra.status || 'released',
  ]);
  if (extra.indexed !== false)
    await engine.query(
      'INSERT INTO anime_search_metadata VALUES($1,$2,$3,$4)',
      [id, title.toLowerCase(), [title.toLowerCase()], '[]'],
    );
}
await seed(16498, 'Attack on Titan');
await seed(90001, 'Attack on Titan OVA', { kind: 'ova' });
await seed(77777, 'Story 16498', { score: 10 });
await seed(86, 'Slayers');
await seed(41457, '86 Eighty Six');
await seed(55555, 'Unindexed anime', { indexed: false });

await test('exact anime ID leads the results in both full search and header suggestions', async () => {
  for (const limit of [7, 24]) {
    const response = await searchAnime({ query: ' 16498 ', limit });
    assert.equal(response.results[0].type, 'anime');
    assert.equal(response.results[0].item.id, 16498);
    assert.equal(response.results[0].item.russian, 'Attack on Titan');
    assert.ok(!response.results.some((result) => result.item?.id === 90001));
  }
  assert.equal(groupedCalls, 0);
});
await test('numeric titles remain searchable after the exact ID match', async () => {
  const response = await searchAnime({ query: '86' });
  assert.deepEqual(
    response.results.map((result) => result.item.id),
    [86, 41457],
  );
});
await test('ID lookup works before title aliases are indexed and respects filters', async () => {
  assert.equal(
    (await searchAnime({ query: '55555' })).results[0].item.id,
    55555,
  );
  assert.equal(
    (await searchAnime({ query: '16498', kind: 'movie' })).results.length,
    0,
  );
  assert.equal(
    (await searchAnime({ query: '16498', status: 'ongoing' })).results.length,
    0,
  );
  assert.equal(
    (await searchAnime({ query: '16498', genres: ['Romance'] })).results.length,
    0,
  );
});
await test('ID search retains pagination and handles unknown or oversized IDs', async () => {
  const page1 = await searchAnime({ query: '16498', limit: 1 });
  assert.deepEqual(page1.pagination, { page: 1, pages: 2, total: 2 });
  assert.equal(
    (await searchAnime({ query: '16498', limit: 1, page: 2 })).results[0].item
      .id,
    77777,
  );
  assert.equal((await searchAnime({ query: '999999999' })).results.length, 0);
  assert.equal(
    (await searchAnime({ query: '999999999999999999999999' })).results.length,
    0,
  );
});
await test('text search still uses the franchise grouping path', async () => {
  groupedCalls = 0;
  const response = await searchAnime({ query: 'Attack on Titan' });
  assert.equal(groupedCalls, 1);
  assert.ok(response.results.some((result) => result.item.id === 16498));
});
await engine.close();
delete globalThis.__searchIdTest;
