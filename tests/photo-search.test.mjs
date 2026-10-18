import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { PGlite } from '@electric-sql/pglite';

const url = (source) =>
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
async function source(path, replacements = {}) {
  let text = stripTypeScriptTypes(
    await readFile(new URL(path, import.meta.url), 'utf8'),
  );
  for (const [name, replacement] of Object.entries(replacements))
    text = text.replaceAll(`'${name}'`, JSON.stringify(replacement));
  return url(text);
}
const pureUrl = await source('../lib/photo-search.ts');
const { parseSceneMatches, traceError, sceneImage, fitCrop } = await import(
  pureUrl
);
const hit = (id, similarity, extra = {}) => ({
  anilist: { id, title: { romaji: 'Anime ' + id } },
  similarity,
  ...extra,
});

await test('trace results are sorted, deduplicated by anime, bounded to three and safely parsed', () => {
  const matches = parseSceneMatches({
    result: [
      hit(1, 0.8),
      hit(1, 0.99, { episode: '01-02', from: 12, to: 15 }),
      hit(2, 0.9, { episode: null }),
      hit(3, 0.85),
      hit(4, 0.84),
      hit(5, Infinity),
      hit(6, 1.1),
      hit(0, 0.98),
      null,
    ],
  });
  assert.deepEqual(
    matches.map((item) => item.anilistId),
    [1, 2, 3],
  );
  assert.equal(matches[0].episode, '01-02');
  assert.equal(matches[1].episode, null);
  assert.equal(matches[0].from, 12);
  assert.equal(matches[0].to, 15);
  assert.equal(
    parseSceneMatches({
      result: [
        { anilist: 42, similarity: 0.7, episode: 3, from: -1, to: 'bad' },
      ],
    })[0].episode,
    '3',
  );
  assert.deepEqual(parseSceneMatches({ result: [] }), []);
  assert.throws(() => parseSceneMatches({ error: '' }));
});
await test('untrusted previews cannot inject URLs outside trace.moe', () => {
  for (const value of [
    'javascript:alert(1)',
    'data:image/svg+xml,bad',
    'https://api.trace.moe.evil.org/image/a',
    'http://api.trace.moe/image/a',
    'https://user:pass@api.trace.moe/image/a',
  ])
    assert.equal(sceneImage(value), null);
  assert.equal(
    sceneImage('https://api.trace.moe/image/a'),
    'https://api.trace.moe/image/a',
  );
  assert.equal(
    sceneImage('https://media.trace.moe/a'),
    'https://media.trace.moe/a',
  );
});
await test('quota, concurrency, rate limits, invalid images and upstream outages get distinct messages', () => {
  assert.match(traceError(402, { error: 'Search quota depleted' }), /исчерпан/);
  assert.match(traceError(200, { error: 'Search quota depleted' }), /исчерпан/);
  assert.match(traceError(429, {}, '17'), /17 сек/);
  assert.match(
    traceError(402, { error: 'Concurrency limit exceeded' }),
    /ограничил/,
  );
  assert.match(traceError(503, {}), /перегружен/);
  assert.match(traceError(400, {}), /прочитать/);
  assert.match(traceError(413, {}), /большое/);
});
await test('crop rectangles stay inside portrait and landscape images and maintain selected aspect', () => {
  for (const [width, height] of [
    [1080, 1920],
    [1920, 1080],
    [600, 600],
  ])
    for (const ratio of [16 / 9, 4 / 3])
      for (const scale of [0.2, 0.9, 1]) {
        const crop = fitCrop(width, height, ratio, scale, 1, 0);
        assert.ok(
          crop.x >= 0 &&
            crop.y >= 0 &&
            crop.x + crop.width <= 1.000001 &&
            crop.y + crop.height <= 1.000001,
        );
        assert.ok(
          Math.abs((crop.width * width) / (crop.height * height) - ratio) <
            0.000001,
        );
      }
});

const engine = new PGlite();
await engine.exec(`CREATE TABLE anime_cache(id integer PRIMARY KEY,data text);
  CREATE TABLE anime_search_metadata(anime_id integer PRIMARY KEY,aliases jsonb,normalized_aliases text[]);
  CREATE TABLE catalog_page_cache(cache_key text PRIMARY KEY,data text,updated_at bigint);
  CREATE TABLE auth_limits(key text PRIMARY KEY,attempts integer,expires bigint);`);
let clock = 1800000000000;
const database = {
  prepare(text) {
    let index = 0,
      values = [];
    const query = text.replace(/\?/g, () => '$' + ++index);
    const execute = () => engine.query(query, values);
    return {
      bind(...input) {
        values = input;
        return this;
      },
      run: execute,
      async first() {
        return (await execute()).rows[0];
      },
      async all() {
        return { results: (await execute()).rows };
      },
    };
  },
};
globalThis.__photoSearchTest = { database, now: () => clock };
const originalCore = await readFile(
  new URL('../lib/server/core.ts', import.meta.url),
  'utf8',
);
// Exercise the real origin, hashing and error helpers, with an isolated PostgreSQL adapter.
const coreHelpers = originalCore.slice(
  originalCore.indexOf('export const now ='),
  originalCore.indexOf('export const cookie ='),
);
const coreUrl = url(`export const db=()=>globalThis.__photoSearchTest.database;
  const runtime=()=>({});
  ${stripTypeScriptTypes(coreHelpers, { mode: 'transform' }).replace('Date.now()', 'globalThis.__photoSearchTest.now()')}`);
const serverUrl = await source('../lib/server/photo-search.ts', {
  '@/lib/photo-search': pureUrl,
  './core': coreUrl,
  './shikimori-matching': await source('../lib/server/shikimori-matching.ts'),
});
const { matchCatalogIdentity, resolveSceneAnime } = await import(serverUrl);
const { POST } = await import(
  await source('../app/api/photo-search/resolve/route.ts', {
    '@/lib/server/core': coreUrl,
    '@/lib/photo-search': pureUrl,
    '@/lib/server/photo-search': serverUrl,
  })
);
const anime = (id, name, extra = {}) => ({
  id,
  name,
  russian: name,
  kind: 'tv',
  aired_on: '2013-04-07',
  ...extra,
});
const metadata = {
  id: 16498,
  idMal: 16498,
  titles: ['Shingeki no Kyojin', 'Attack on Titan'],
  primaryTitles: ['Shingeki no Kyojin', 'Attack on Titan'],
  year: 2013,
  format: 'TV',
};

await test('catalog links prefer AniList then MAL identifiers, and reject ambiguous matches', () => {
  const exact = anime(1, 'Different', { anilist_id: 16498 });
  const mal = anime(2, 'Attack on Titan', { mal_id: 16498 });
  assert.equal(matchCatalogIdentity(metadata, [exact, mal]).id, 1);
  assert.equal(matchCatalogIdentity(metadata, [mal]).id, 2);
  assert.equal(
    matchCatalogIdentity(metadata, [exact, { ...exact, id: 3 }]),
    null,
  );
  assert.equal(matchCatalogIdentity(metadata, [mal, { ...mal, id: 3 }]), null);
});
await test('title fallback requires exact identity, year and media format; seasons, remakes, films and OVAs stay distinct', () => {
  const correct = anime(1, 'Shingeki no Kyojin');
  assert.equal(matchCatalogIdentity(metadata, [correct]).id, 1);
  for (const wrong of [
    anime(2, 'Shingeki no Kyojin Season 2'),
    anime(3, 'Shingeki no Kyojin', { aired_on: '2017-01-01' }),
    anime(4, 'Shingeki no Kyojin', { kind: 'ova' }),
    anime(5, 'Shingeki no Kyojin', { kind: 'movie' }),
    anime(6, 'Shingeki no Kyojin', { mal_id: 123 }),
  ])
    assert.equal(matchCatalogIdentity(metadata, [wrong]), null);
  assert.equal(
    matchCatalogIdentity(metadata, [correct, { ...correct, id: 7 }]),
    null,
  );
  assert.equal(
    matchCatalogIdentity({ ...metadata, year: null }, [correct]),
    null,
  );
  assert.equal(
    matchCatalogIdentity(
      { ...metadata, titles: [...metadata.titles, 'Generic Franchise'] },
      [anime(8, 'Generic Franchise')],
    ),
    null,
  );
});

const media = {
  id: 16498,
  idMal: 16498,
  type: 'ANIME',
  title: { romaji: 'Shingeki no Kyojin', english: 'Attack on Titan' },
  synonyms: [],
  format: 'TV',
  startDate: { year: 2013 },
};
await engine.query('INSERT INTO anime_cache VALUES($1,$2)', [
  16498,
  JSON.stringify(anime(16498, 'Shingeki no Kyojin', { mal_id: 16498 })),
]);
await test('resolver uses trusted AniList data, persists metadata, and keeps stale metadata during outages without changing catalog data', async (t) => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests++;
    assert.equal(url, 'https://graphql.anilist.co');
    assert.equal(JSON.parse(options.body).variables.id, 16498);
    return Response.json({ data: { Media: media } });
  });
  const before = (await engine.query('SELECT data FROM anime_cache')).rows;
  const result = await resolveSceneAnime(16498, new AbortController().signal);
  assert.equal(result.anime.id, 16498);
  assert.equal(result.title, 'Shingeki no Kyojin');
  await resolveSceneAnime(16498, new AbortController().signal);
  assert.equal(requests, 1);
  clock += 8 * 86400000;
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('offline');
  });
  assert.equal(
    (await resolveSceneAnime(16498, new AbortController().signal)).anime.id,
    16498,
  );
  assert.deepEqual(
    (await engine.query('SELECT data FROM anime_cache')).rows,
    before,
  );
});
await test('existing AniList mapping avoids external calls; upstream outages are not reported as missing catalog entries', async (t) => {
  await engine.query('INSERT INTO anime_cache VALUES($1,$2)', [
    20,
    JSON.stringify(anime(20, 'Naruto', { anilist_id: 20 })),
  ]);
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('offline');
  });
  assert.equal(
    (await resolveSceneAnime(20, new AbortController().signal)).anime.id,
    20,
  );
  const missing = await resolveSceneAnime(999998, new AbortController().signal);
  assert.equal(missing.unavailable, true);
});
await test('duplicate catalog identities are reported as unconfirmed rather than linked to an arbitrary entry', async () => {
  await engine.query('INSERT INTO anime_cache VALUES($1,$2)', [
    21,
    JSON.stringify(anime(21, 'Duplicate Naruto', { anilist_id: 20 })),
  ]);
  const result = await resolveSceneAnime(20, new AbortController().signal);
  assert.equal(result.anime, null);
  assert.equal(result.unmatched, true);
  await engine.query('DELETE FROM anime_cache WHERE id=21');
});
await test('resolver respects AniList Retry-After without repeated upstream requests', async (t) => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    return new Response('', { status: 429, headers: { 'Retry-After': '120' } });
  });
  assert.equal(
    (await resolveSceneAnime(999997, new AbortController().signal)).unavailable,
    true,
  );
  assert.equal(
    (await resolveSceneAnime(999996, new AbortController().signal)).unavailable,
    true,
  );
  assert.equal(requests, 1);
});

const request = (payload, origin = 'http://localhost:3000', extra = {}) =>
  new Request('http://localhost:3000/api/photo-search/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, ...extra },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
await test('guest endpoint accepts IDs only, validates body size, and rejects cross-origin requests', async () => {
  assert.equal((await POST(request({ ids: [20] }))).status, 200);
  assert.equal(
    (await POST(request({ ids: [20] }, 'https://evil.org'))).status,
    403,
  );
  for (const payload of [
    { ids: [] },
    { ids: [1, 2, 3, 4] },
    { ids: ['20'] },
    { ids: [-1] },
    { url: 'http://127.0.0.1' },
    '{bad',
  ])
    assert.equal((await POST(request(payload))).status, 400);
  assert.equal((await POST(request(' '.repeat(1025)))).status, 413);
  assert.equal(
    (
      await POST(
        request({ ids: [20] }, 'http://localhost:3000', {
          'Content-Type': 'image/png',
        }),
      )
    ).status,
    415,
  );
});
await test('guest metadata endpoint enforces a database-backed per-IP limit and recovers after its window', async () => {
  for (let i = 0; i < 30; i++)
    assert.equal(
      (
        await POST(
          request({ ids: [20] }, 'http://localhost:3000', {
            'x-real-ip': '198.51.100.30',
          }),
        )
      ).status,
      200,
    );
  const limited = await POST(
    request({ ids: [20] }, 'http://localhost:3000', {
      'x-real-ip': '198.51.100.30',
    }),
  );
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Retry-After'), '60');
  clock += 61000;
  assert.equal(
    (
      await POST(
        request({ ids: [20] }, 'http://localhost:3000', {
          'x-real-ip': '198.51.100.30',
        }),
      )
    ).status,
    200,
  );
});
await engine.close();
delete globalThis.__photoSearchTest;
