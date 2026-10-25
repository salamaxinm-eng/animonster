import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = stripTypeScriptTypes(
  await readFile(new URL('../lib/player-demo.ts', import.meta.url), 'utf8'),
);
const { parseDemoCatalog, boundedPosition, activeDemoSegment } = await import(
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
);
const fixture = () => ({
  version: 1,
  title: 'Demo',
  privatePath: '/root/source.mkv',
  episodes: [
    {
      number: 1,
      title: 'Episode',
      duration: 120,
      voices: [
        {
          id: 'voice',
          title: 'Voice',
          master: '/demo-media/ep-1/voice-master.m3u8',
          qualities: [
            { height: 1080, url: '/demo-media/ep-1/voice-1080.m3u8' },
          ],
          opening: { start: 10, stop: 30 },
          ending: { start: 110, stop: 130 },
          source: '/private/file.mkv',
        },
      ],
    },
  ],
});

void test('public catalog strips source metadata and invalid skip times', () => {
  const catalog = parseDemoCatalog(fixture());
  assert.equal(catalog.privatePath, undefined);
  assert.equal(catalog.episodes[0].voices[0].source, undefined);
  assert.equal(catalog.episodes[0].voices[0].ending, undefined);
  assert.equal(activeDemoSegment(catalog.episodes[0].voices[0], 15).stop, 30);
  assert.equal(activeDemoSegment(catalog.episodes[0].voices[0], 30), undefined);
});
void test('catalog rejects external URLs, traversal and duplicate episodes', () => {
  for (const path of [
    'https://example.org/x.m3u8',
    '/demo-media/../secret.m3u8',
    '/demo-media//bad.m3u8',
    '/demo-media/x.vtt',
  ]) {
    const raw = fixture();
    raw.episodes[0].voices[0].master = path;
    assert.throws(() => parseDemoCatalog(raw));
  }
  const raw = fixture();
  raw.episodes.push(raw.episodes[0]);
  assert.throws(() => parseDemoCatalog(raw));
});
void test('seeking and resume stay within media boundaries', () => {
  assert.equal(boundedPosition(-10, 120), 0);
  assert.equal(boundedPosition(200, 120), 119.8);
  assert.equal(boundedPosition(NaN, 120), 0);
  assert.equal(boundedPosition(10, Infinity), 0);
});

void test('continuous seasons validate their chapter boundaries and use local episode progress', async () => {
  const seasonCode = stripTypeScriptTypes(
    await readFile('lib/demo-season.ts', 'utf8'),
  );
  const { seasonPoint, seasonPosition } = await import(
    'data:text/javascript;base64,' + Buffer.from(seasonCode).toString('base64')
  );
  const raw = fixture();
  raw.episodes.push({
    ...structuredClone(raw.episodes[0]),
    number: 2,
    duration: 150,
  });
  raw.season = {
    id: 'season-0123456789abcdef',
    duration: 270,
    chapters: [
      { episode: 1, start: 0, stop: 120 },
      { episode: 2, start: 120, stop: 270 },
    ],
    voices: raw.episodes[0].voices,
  };
  const parsed = parseDemoCatalog(raw);
  const season = parsed.season;
  assert.equal(season.id, 'season-0123456789abcdef');
  assert.deepEqual(seasonPoint(season, 119), { episode: 1, position: 119 });
  assert.deepEqual(seasonPoint(season, 120), { episode: 2, position: 0 });
  assert.deepEqual(seasonPoint(season, 137), { episode: 2, position: 17 });
  assert.equal(seasonPosition(season, 2, 17), 137);
  assert.deepEqual(seasonPoint(season, Infinity), { episode: 1, position: 0 });
  assert.deepEqual(seasonPoint(season, 270), { episode: 2, position: 150 });
  raw.season.chapters[1].start = 121;
  assert.throws(() => parseDemoCatalog(raw), /boundary/);
  raw.season.chapters[1].start = 120;
  raw.season.voices[0].master = 'https://external.example/master.m3u8';
  assert.throws(() => parseDemoCatalog(raw));
});
