import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = (
  await readFile(new URL('../lib/server/media.ts', import.meta.url), 'utf8')
).replace(
  "import { ApiError, runtime } from './core';",
  `class ApiError extends Error { constructor(message, status, code) { super(message); this.status=status; this.code=code; } } const runtime = () => process.env;`,
);
const media = await import(
  'data:text/javascript;base64,' +
    Buffer.from(stripTypeScriptTypes(source)).toString('base64')
);

test('media proxy follows numbered CDN hosts with legacy deployment configuration', async () => {
  process.env.MEDIA_PROXY_HOSTS = 'cache.libria.fun,cache1.libria.fun';
  process.env.MEDIA_PROXY_ENABLED = 'true';
  process.env.MEDIA_PROXY_SECRET =
    'test-only-media-secret-at-least-32-characters';
  for (const host of [
    'cache2.libria.fun',
    'cache6.libria.fun',
    'cache7.libria.fun',
    'cache9.libria.fun',
  ]) {
    const url = `https://${host}/videos/segment.ts`;
    assert.equal(media.validateMediaUrl(url).hostname, host);
    const signed = await media.mediaProxyUrl(url);
    assert.equal(
      (
        await media.readMediaToken(
          new URL(signed, 'https://example.test').searchParams.get('token'),
        )
      ).href,
      url,
    );
  }
  for (const url of [
    'https://cache2.libria.fun.evil.test/a',
    'https://evil.libria.fun/a',
    'https://127.0.0.1/a',
    'http://cache2.libria.fun/a',
    'https://cache2.libria.fun:444/a',
    'https://user:pass@cache2.libria.fun/a',
  ]) {
    assert.throws(() => media.validateMediaUrl(url), {
      code: 'media_host_denied',
    });
  }
  process.env.MEDIA_PROXY_HOSTS = 'cache1.libria.fun';
  assert.throws(() => media.validateMediaUrl('https://cache2.libria.fun/a'), {
    code: 'media_host_denied',
  });
});

test('media access binding survives manifest rewriting', async () => {
  process.env.MEDIA_PROXY_HOSTS = 'cache.libria.fun';
  process.env.MEDIA_PROXY_ENABLED = 'true';
  process.env.MEDIA_PROXY_SECRET =
    'test-only-media-secret-at-least-32-characters';
  const userId = '11111111-1111-4111-8111-111111111111';
  const freeAt = Date.now() + 3600000;
  const manifest = await media.rewriteManifest(
    '#EXTM3U\nsegment.ts',
    new URL('https://cache.libria.fun/show/index.m3u8'),
    { userId, freeAt },
  );
  const child = manifest.split('\n')[1];
  const details = await media.readMediaTokenDetails(
    new URL(child, 'https://example.test').searchParams.get('token'),
  );
  assert.equal(details.access.userId, userId);
  assert.equal(details.access.freeAt, freeAt);
});
