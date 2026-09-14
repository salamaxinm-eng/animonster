import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = (
  await readFile(new URL('../lib/server/images.ts', import.meta.url), 'utf8')
).replace(
  "import { ApiError } from './core';",
  `class ApiError extends Error { constructor(message, status, code) { super(message); this.status=status; this.code=code; } }`,
);
const images = await import(
  'data:text/javascript;base64,' +
    Buffer.from(stripTypeScriptTypes(source)).toString('base64')
);

test('image gateway accepts exact Shikimori image hosts', () => {
  for (const host of [
    'shikimori.one',
    'desu.shikimori.one',
    'shikimori.io',
    'desu.shikimori.io',
  ])
    assert.equal(
      images.safeRemoteImageUrl(`https://${host}/uploads/poster/test.jpg`)
        .hostname,
      host,
    );
});

test('image gateway rejects lookalike hosts and unsafe URLs', () => {
  for (const url of [
    'https://shikimori.io.evil.test/poster.jpg',
    'https://evil.shikimori.io/poster.jpg',
    'http://shikimori.io/poster.jpg',
    'https://user:password@shikimori.io/poster.jpg',
    'https://shikimori.io:444/poster.jpg',
  ])
    assert.throws(() => images.safeRemoteImageUrl(url));
});
