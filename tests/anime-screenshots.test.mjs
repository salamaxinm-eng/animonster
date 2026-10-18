import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const url = (s) =>
  'data:text/javascript;base64,' + Buffer.from(s).toString('base64');
let cached = null;
globalThis.__screenshotTestDb = {
  prepare() {
    return {
      bind() {
        return this;
      },
      async first() {
        return cached;
      },
    };
  },
};
const core = url(
  'export const db=()=>globalThis.__screenshotTestDb; export class ApiError extends Error {}',
);
const images = url(
  stripTypeScriptTypes(
    await readFile(new URL('../lib/server/images.ts', import.meta.url), 'utf8'),
  ).replace("'./core'", JSON.stringify(core)),
);
const source = stripTypeScriptTypes(
  await readFile(
    new URL('../lib/server/anime-screenshots.ts', import.meta.url),
    'utf8',
  ),
)
  .replace("'./core'", JSON.stringify(core))
  .replace("'./images'", JSON.stringify(images));
const moduleUrl = url(source);
const { animeScreenshot } = await import(moduleUrl);
const route = stripTypeScriptTypes(
  await readFile(
    new URL('../app/api/anime-screenshot/route.ts', import.meta.url),
    'utf8',
  ),
).replace("'@/lib/server/anime-screenshots'", JSON.stringify(moduleUrl));
const { GET } = await import(url(route));
await test('screenshots use exact anime ID and return a full original URL with cached upstream requests', async (t) => {
  cached = null;
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    assert.equal(path, 'https://shikimori.one/api/animes/16498/screenshots');
    assert.equal(options.next.revalidate, 86400);
    return Response.json([
      {
        original: '/system/screenshots/original/attack.jpg',
        preview: '/small.jpg',
      },
    ]);
  });
  assert.equal(
    await animeScreenshot(16498),
    'https://shikimori.one/system/screenshots/original/attack.jpg',
  );
});
await test('synthetic local anime IDs use the mapped Shikimori ID and unmapped IDs do not fetch', async (t) => {
  cached = { data: JSON.stringify({ shikimori_id: 16498 }) };
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (path) => {
    calls++;
    assert.ok(path.includes('/16498/screenshots'));
    return Response.json([]);
  });
  assert.equal(await animeScreenshot(100001234), null);
  cached = null;
  assert.equal(await animeScreenshot(100001234), null);
  assert.equal(calls, 1);
});
await test('unsafe screenshot URLs are rejected and safe candidates are still used', async (t) => {
  cached = null;
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json([
      { original: 'http://169.254.169.254/latest' },
      { original: 'https://evil.example/test.jpg' },
      { original: 'https://user:secret@shikimori.one/test.jpg' },
      { original: '//desu.shikimori.one/system/screenshots/original/safe.jpg' },
    ]),
  );
  assert.equal(
    await animeScreenshot(16498),
    'https://desu.shikimori.one/system/screenshots/original/safe.jpg',
  );
});
await test('missing frames and source failures return optional empty artwork without breaking the page', async (t) => {
  cached = null;
  t.mock.method(globalThis, 'fetch', async () => Response.json([]));
  let response = await GET(
    new Request('https://site.test/api/anime-screenshot?anime_id=16498'),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { image: null });
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('timeout');
  });
  response = await GET(
    new Request('https://site.test/api/anime-screenshot?anime_id=16498'),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { image: null });
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
await test('invalid IDs fail before fetching screenshots', async (t) => {
  t.mock.method(globalThis, 'fetch', () => {
    throw new Error('Must not fetch');
  });
  for (const id of ['', '0', '-1', 'abc', '1.5', '1000000000'])
    assert.equal(
      (
        await GET(
          new Request('https://site.test/api/anime-screenshot?anime_id=' + id),
        )
      ).status,
      400,
    );
});
delete globalThis.__screenshotTestDb;
