import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { PGlite } from '@electric-sql/pglite';

const moduleUrl = (source) =>
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
async function load(path, replacements = {}, extra = '') {
  let source = stripTypeScriptTypes(
    await readFile(new URL(path, import.meta.url), 'utf8'),
  );
  for (const [name, replacement] of Object.entries(replacements))
    source = source.replaceAll(`'${name}'`, JSON.stringify(replacement));
  return import(moduleUrl(source + extra));
}
const engine = new PGlite();
await engine.exec(`
  CREATE TABLE anime_cache (id integer PRIMARY KEY, data text NOT NULL, episodes text DEFAULT '[]', updated_at bigint DEFAULT 0,
    primary_provider text,search_text text,kind_index text,status_index text,year_index integer,score_index float,genres_index jsonb);
  CREATE TABLE anime_search_metadata (anime_id integer PRIMARY KEY,aliases jsonb DEFAULT '[]',normalized_aliases text[] DEFAULT '{}',
    normalized_titles text DEFAULT '',themes jsonb DEFAULT '[]',status text DEFAULT 'pending',version integer DEFAULT 1,
    attempts integer DEFAULT 0,checked_at bigint DEFAULT 0,last_error text);
`);
let time = 1800000000000;
const db = {
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
globalThis.__identityTest = { db, now: () => time };
const core = moduleUrl(
  'export const db=()=>globalThis.__identityTest.db; export const now=()=>globalThis.__identityTest.now(); export const runtime=()=>({});',
);
const age = moduleUrl(
  stripTypeScriptTypes(
    await readFile(new URL('../lib/age-rating.ts', import.meta.url), 'utf8'),
  ),
);
const matching = moduleUrl(
  stripTypeScriptTypes(
    await readFile(
      new URL('../lib/server/shikimori-matching.ts', import.meta.url),
      'utf8',
    ),
  ),
);
const metadata = await load('../lib/server/search-metadata.ts', {
  './core': core,
  '@/lib/age-rating': age,
  './shikimori-matching': matching,
});
globalThis.__identityTest.canonicalize = metadata.canonicalizeAnimeIdentities;
const library = await load('../lib/server/library.ts', {
  './core': core,
  './anime': moduleUrl(
    'export const findRelease=()=>{}; export const liberty=()=>{}; export const available=()=>true; export const normalize=x=>x;',
  ),
  './search-metadata': moduleUrl(
    'export const ensureSearchMetadata=()=>{}; export const canonicalizeAnimeIdentities=items=>globalThis.__identityTest.canonicalize(items);',
  ),
  './anime-relations': moduleUrl('export const ensureRelationState=()=>{};'),
});
const sync = await load(
  '../lib/server/kodik-sync.ts',
  {
    './core': core,
    '@/lib/age-rating': age,
    './shikimori-matching': matching,
    './library': moduleUrl('export const saveAnime=()=>{};'),
    './episode-access': moduleUrl('export const syncEpisodeAccess=()=>{};'),
    './episode-notifications': moduleUrl(
      'export const queueEpisodeNotifications=()=>{};',
    ),
    './kodik': moduleUrl(
      'export const allowedKodikResult=()=>true; export const kodikLastEpisode=x=>x.last_episode||0; export const kodikCatalogPage=()=>{}; export const rememberKodikSources=()=>{};',
    ),
  },
  '\nexport { normalizeKodikAnime };',
);
const anime = (id, date = '2016') => ({
  id,
  shikimori_id: id,
  russian: 'Season ' + id,
  name: 'Season ' + id,
  kind: 'tv',
  image: { original: 'https://example.test/poster-' + id + '.jpg' },
  aired_on: date,
  episodes: 12,
  score: '8',
  providers: ['kodik'],
});
const canonical = (id, date = '2026-04-08') => ({
  id,
  name: 'Season ' + id,
  russian: 'Season ' + id,
  kind: 'tv',
  airedOn: { date },
  poster: { originalUrl: 'https://example.test/canonical-' + id + '.jpg' },
});
const readAnime = async (id) =>
  JSON.parse(
    (await engine.query('SELECT data FROM anime_cache WHERE id=$1', [id]))
      .rows[0].data,
  );

await test('season dates repair by exact ID with distinct posters, persist, and respect the freshness TTL', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const ids = JSON.parse(options.body).variables.ids.split(',').map(Number);
    requests.push(ids);
    return Response.json({
      data: {
        animes: ids.map((id) =>
          canonical(id, id === 1 ? '2016-04-04' : '2026-04-08'),
        ),
      },
    });
  });
  const items = [anime(1), anime(2)];
  for (const item of items) await library.saveAnime(item);
  const repaired = await metadata.canonicalizeAnimeIdentities(items);
  assert.equal(repaired[0].aired_on, '2016-04-04');
  assert.equal(repaired[1].aired_on, '2026-04-08');
  assert.equal((await readAnime(2)).aired_on_source, 'shikimori');
  assert.equal(
    (await engine.query('SELECT year_index FROM anime_cache WHERE id=2'))
      .rows[0].year_index,
    2026,
  );
  await metadata.canonicalizeAnimeIdentities(repaired);
  assert.equal(requests.length, 1);
  time += 8 * 24 * 60 * 60 * 1000;
  await metadata.canonicalizeAnimeIdentities([repaired[1]]);
  assert.equal(requests.length, 2);
});

await test('opening a cached anime page repairs its own year without needing other seasons', async (t) => {
  const item = anime(250);
  await library.saveAnime(item, [{ ordinal: 1, duration: 1440 }]);
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ data: { animes: [canonical(250)] } }),
  );
  const result = await library.getAnime(250);
  assert.equal(result.anime.aired_on, '2026-04-08');
});

await test('large franchises repair every batch and metadata outages keep cached entries usable', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const ids = JSON.parse(options.body).variables.ids.split(',').map(Number);
    requests.push(ids);
    return Response.json({ data: { animes: ids.map((id) => canonical(id)) } });
  });
  const items = Array.from({ length: 51 }, (_, i) => anime(100 + i));
  for (const item of items) await library.saveAnime(item);
  const repaired = await metadata.canonicalizeAnimeIdentities(items);
  assert.deepEqual(
    requests.map((ids) => ids.length),
    [50, 1],
  );
  assert.ok(repaired.every((item) => item.aired_on === '2026-04-08'));
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('offline');
  });
  assert.deepEqual(await metadata.canonicalizeAnimeIdentities([anime(200)]), [
    anime(200),
  ]);
});

await test('catalog imports cannot overwrite canonical years or their sorting index', async () => {
  const incoming = { ...anime(2), episodes: 20 };
  await library.saveAnime(incoming);
  assert.equal((await readAnime(2)).aired_on, '2026-04-08');
  assert.equal((await readAnime(2)).episodes, 20);
  assert.equal(
    (await engine.query('SELECT year_index FROM anime_cache WHERE id=2'))
      .rows[0].year_index,
    2026,
  );
  await library.saveAnime({
    ...incoming,
    aired_on: '2027-01-01',
    aired_on_source: 'shikimori',
    identity_checked_at: time,
  });
  assert.equal((await readAnime(2)).aired_on, '2027-01-01');
  assert.equal(
    (await engine.query('SELECT year_index FROM anime_cache WHERE id=2'))
      .rows[0].year_index,
    2027,
  );
});

await test('Kodik preserves verified dates and otherwise prefers the specific release year over material metadata', () => {
  const item = {
    title: 'Season 4',
    title_orig: 'Season 4',
    type: 'anime-serial',
    year: 2026,
    last_episode: 12,
    material_data: {
      year: 2016,
      anime_title: 'Season 4',
      anime_poster_url: 'https://example.test/poster.jpg',
    },
  };
  assert.equal(sync.normalizeKodikAnime(item, 2).aired_on, '2026');
  const verified = {
    ...anime(2, '2026-04-08'),
    aired_on_source: 'shikimori',
    identity_checked_at: time,
  };
  assert.equal(
    sync.normalizeKodikAnime({ ...item, year: 2016 }, 2, verified).aired_on,
    '2026-04-08',
  );
  assert.equal(
    sync.normalizeKodikAnime(item, 2, verified, { aired_on: '2027-01-01' })
      .aired_on,
    '2027-01-01',
  );
});

await test('background metadata refresh revisits previously completed rows and stores corrected dates', async (t) => {
  const item = anime(300);
  await library.saveAnime(item);
  await engine.query(
    "INSERT INTO anime_search_metadata(anime_id,version,status,checked_at) VALUES(300,3,'ok',$1)",
    [time],
  );
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ data: { animes: [canonical(300)] } }),
  );
  assert.deepEqual(await metadata.refreshSearchMetadata(), {
    processed: 1,
    completed: 1,
    failed: 0,
  });
  assert.equal((await readAnime(300)).aired_on, '2026-04-08');
  assert.equal(
    (
      await engine.query(
        'SELECT version FROM anime_search_metadata WHERE anime_id=300',
      )
    ).rows[0].version,
    4,
  );
  assert.equal((await metadata.refreshSearchMetadata()).processed, 0);
});
await engine.close();
delete globalThis.__identityTest;
