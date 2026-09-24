import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';

async function sourceModule(path, transform = (value) => value) {
  const source = transform(
    await readFile(new URL(path, import.meta.url), 'utf8'),
  );
  return import(
    'data:text/javascript;base64,' +
      Buffer.from(stripTypeScriptTypes(source)).toString('base64')
  );
}

const rules = await sourceModule('../lib/offline/rules.ts');
const hls = await sourceModule('../lib/offline/hls.ts', (source) =>
  source.replace(
    "import type { OfflineManifest, OfflineSegment } from './types';",
    '',
  ),
);
const deletion = await sourceModule('../lib/offline/delete.ts');

test('offline entitlement rejects non-Plus and accepts active Plus', () => {
  assert.deepEqual(rules.offlineEntitlementIssue(false), {
    message: 'Доступно с AniMonster Plus',
    code: 'PLUS_REQUIRED',
    status: 403,
  });
  assert.equal(rules.offlineEntitlementIssue(true), null);
});

test('offline selection rejects Kodik and invalid quality', () => {
  assert.equal(
    rules.offlineSelection({
      animeId: 1,
      episode: 2,
      quality: 720,
      voiceoverId: 'kodik',
    }).code,
    'DOWNLOAD_PROVIDER_UNSUPPORTED',
  );
  assert.equal(
    rules.offlineSelection({
      animeId: 1,
      episode: 2,
      quality: 360,
      voiceoverId: 'aniliberty',
    }).code,
    'INVALID_QUALITY',
  );
});

test('offline selection never accepts a caller supplied media URL', () => {
  const result = rules.offlineSelection({
    animeId: 1,
    episode: 2,
    quality: 720,
    voiceoverId: 'aniliberty',
    url: 'https://evil.test/video.m3u8',
  });
  assert.deepEqual(result, {
    animeId: 1,
    episode: 2,
    quality: 720,
    voiceoverId: 'aniliberty',
  });
  assert.equal('url' in result, false);
});

test('HLS parser stores map and media segments and resume skips completed files', () => {
  const parsed = hls.parseMediaPlaylist(
    '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:5,\none.m4s\n#EXTINF:6,\ntwo.m4s\n#EXT-X-ENDLIST',
    'https://media.test/show/playlist.m3u8',
    'show-1-720',
  );
  assert.equal(parsed.segments.length, 3);
  assert.equal(
    parsed.segments[0].remoteUrl,
    'https://media.test/show/init.mp4',
  );
  assert.match(parsed.playlist, /offline:\/\/animonster/);
  parsed.segments[0].downloaded = true;
  parsed.segments[2].downloaded = true;
  assert.deepEqual(hls.missingSegmentIds(parsed), ['segment-0']);
});

test('deleting an offline episode removes OPFS data and IndexedDB metadata', async () => {
  const calls = [];
  await deletion.deleteOfflineData(
    'episode-id',
    async (id) => calls.push(['opfs', id]),
    async (id) => calls.push(['indexeddb', id]),
  );
  assert.deepEqual(calls, [
    ['opfs', 'episode-id'],
    ['indexeddb', 'episode-id'],
  ]);
});
