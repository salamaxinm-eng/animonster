import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
const url = (value) =>
  'data:text/javascript;base64,' + Buffer.from(value).toString('base64');
const load = async (path) =>
  import(url(stripTypeScriptTypes(await readFile(path, 'utf8'))));
const session = await load('lib/demo-session.ts');
const offline = await load('lib/offline/demo.ts');
const preview = await load('lib/demo-preview.ts');
const skips = await load('lib/server/demo-skips.ts');

void test('combined downloads pin their original season and support ranges beyond four gigabytes', () => {
  const season = {
    id: 'season-0123456789abcdef',
    chapters: [
      { episode: 1, start: 0, stop: 100 },
      { episode: 2, start: 100, stop: 200 },
      { episode: 3, start: 200, stop: 300 },
      { episode: 4, start: 300, stop: 400 },
    ],
  };
  const original = {
    provider: 'demo',
    downloadId: 'demo-season-0123456789abcdef-anistar-1080',
    animeId: 61316,
    animeTitle: 'Demo',
    animePoster: '/icon-512.png',
    episode: 0,
    duration: 400,
    quality: 1080,
    voiceoverId: 'anistar',
    voiceoverName: 'AniStar',
    season,
    offlineAccessUntil: Date.UTC(2100, 0, 1),
    demoSource: {
      mediaUrl:
        '/demo-media/enhanced/season-0123456789abcdef/anistar-1080-season-offline.mp4',
      mediaSize: 5 * 1024 ** 3 + 123,
      manifestUrl:
        '/demo-media/enhanced/season-0123456789abcdef/anistar-1080.m3u8',
      subtitles: [],
    },
  };
  const restored = offline.savedDemoPreparation(original);
  assert.equal(restored.downloadId, original.downloadId);
  assert.equal(restored.season.id, season.id);
  assert.equal(restored.mediaUrl, original.demoSource.mediaUrl);
  const manifest = offline.demoDownloadManifest(restored),
    last = manifest.segments.at(-1);
  assert.ok(last.rangeEnd > 2 ** 32);
  assert.equal(last.rangeEnd, original.demoSource.mediaSize - 1);
  assert.equal(offline.offlineEpisodeLabel(original), 'Серии 1–4');
  assert.equal(offline.offlineEpisodeLabel({ episode: 3 }), 'Серия 3');
  original.demoSource.mediaUrl = 'https://external.example/file.mp4';
  assert.throws(() => offline.savedDemoPreparation(original));
});

void test('skip database matches only the same release length and never accepts malformed intervals', () => {
  const result = skips.matchedDemoSkips(
    {
      found: true,
      results: [
        {
          skipType: 'op',
          episodeLength: 1424,
          interval: { startTime: 170, endTime: 260 },
        },
        {
          skipType: 'ed',
          episodeLength: 1500,
          interval: { startTime: 1300, endTime: 1400 },
        },
      ],
    },
    1424,
  );
  assert.deepEqual(result, { opening: { start: 170, stop: 260 } });
  assert.deepEqual(
    skips.matchedDemoSkips(
      {
        found: true,
        results: [
          {
            skipType: 'op',
            episodeLength: 1424,
            interval: { startTime: 10, endTime: Infinity },
          },
        ],
      },
      1424,
    ),
    {},
  );
});
void test('offline MP4 chunks cover every byte once, preserve selected subtitles, and reject invalid ranges', () => {
  const size = offline.DEMO_CHUNK_SIZE * 2 + 123;
  const result = offline.demoDownloadManifest({
    mediaSize: size,
    mediaUrl: '/demo-media/ep-1/anistar.mp4',
    subtitles: [
      { url: '/demo-media/ep-1/ru.vtt', title: 'Russian', language: 'ru' },
    ],
  });
  const chunks = result.segments.filter((item) => item.kind === 'segment');
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].rangeStart, 0);
  assert.equal(chunks[2].rangeEnd, size - 1);
  assert.equal(
    chunks.reduce((sum, item) => sum + item.rangeEnd - item.rangeStart + 1, 0),
    size,
  );
  assert.equal(result.segments[3].kind, 'map');
  assert.equal(
    offline.validRangeResponse(`bytes 0-7/${size}`, 0, 7, size),
    true,
  );
  assert.equal(
    offline.validRangeResponse(`bytes 0-8/${size}`, 0, 7, size),
    false,
  );
  assert.throws(() =>
    offline.demoDownloadManifest({
      mediaSize: size,
      mediaUrl: 'https://evil.test/video.mp4',
    }),
  );
});
void test('seek previews parse sprites while rejecting external images and invalid times', () => {
  const vtt =
    'WEBVTT\n\n00:00:00.000 --> 00:00:10.000\npreview-001.jpg#xywh=160,90,160,90\n\n00:00:10.000 --> 00:00:20.000\nhttps://evil.test/x.jpg#xywh=0,0,160,90\n';
  const cues = preview.parseDemoPreviews(
    vtt,
    'https://animonster.su/demo-media/ep-1/preview.vtt',
  );
  assert.equal(cues.length, 1);
  assert.equal(cues[0].x, 160);
  assert.equal(
    cues[0].url,
    'https://animonster.su/demo-media/ep-1/preview-001.jpg',
  );
});
void test('room clock accounts for playback rate and clips to episode end', () => {
  const room = { position: 10, playing: true, rate: 1.5, updated_at: 10000 };
  assert.equal(session.demoPosition(room, 14000, 100), 16);
  assert.equal(session.demoPosition(room, 100000, 100), 100);
  assert.equal(
    session.demoPosition({ ...room, playing: false }, 14000, 100),
    10,
  );
});

void test('returning viewers resume unfinished episodes or advance after completed episodes', () => {
  const episodes = [
    { number: 1, duration: 100 },
    { number: 2, duration: 100 },
  ];
  const item = {
    episode: 1,
    position: 45,
    voice: 'anistar',
    updatedAt: Date.now(),
  };
  assert.equal(session.demoResumePoint([item], episodes).position, 45);
  assert.equal(
    session.demoResumePoint([{ ...item, position: 100 }], episodes).episode,
    2,
  );
  assert.equal(
    session.demoResumePoint([{ ...item, episode: 2, position: 100 }], episodes)
      .position,
    0,
  );
  assert.equal(
    session.demoResumePoint([{ ...item, episode: 99 }], episodes),
    undefined,
  );
});

function database(engine) {
  const client = (connection) => ({
    prepare(source) {
      let values = [],
        index = 0;
      const sql = source.replace(/\?/g, () => '$' + ++index);
      const execute = () => connection.query(sql, values);
      return {
        bind(...params) {
          values = params;
          return this;
        },
        async first() {
          return (await execute()).rows[0] ?? null;
        },
        async all() {
          return { results: (await execute()).rows };
        },
        async run() {
          return execute();
        },
      };
    },
    transaction(callback) {
      return connection.transaction((tx) => callback(client(tx)));
    },
  });
  return client(engine);
}

void test('two independent viewers share host state, cannot control each other, and retain private cross-device progress', async () => {
  const engine = new PGlite();
  try {
    await engine.exec(
      "CREATE TABLE users(id text PRIMARY KEY,nick text); INSERT INTO users VALUES ('host','Host'),('guest','Guest'),('outsider','Outsider'); ALTER TABLE users ADD COLUMN legend_origin_at bigint; ALTER TABLE users ADD COLUMN nickname_style jsonb; UPDATE users SET legend_origin_at=1800000000000 WHERE id='host'",
    );
    await engine.exec(
      await readFile(
        'migrations/postgres/0060_player_demo_features.sql',
        'utf8',
      ),
    );
    globalThis.demoFeatureDb = database(engine);
    const core = url(
      `export const db=()=>globalThis.demoFeatureDb;export const now=()=>Date.now();export class ApiError extends Error{constructor(message,status=400){super(message);this.status=status;}}`,
    );
    const catalog = url(
      `export const demoCatalog=async()=>({episodes:[1,2].map(number=>({number,duration:1424,voices:[{id:'anistar'},{id:'anilibria'}]}))});`,
    );
    const source = stripTypeScriptTypes(
      await readFile('lib/server/demo-session.ts', 'utf8'),
    )
      .replace("'./core'", JSON.stringify(core))
      .replace("'./player-demo'", JSON.stringify(catalog))
      .replace(
        "'../demo-session'",
        JSON.stringify(
          url(
            stripTypeScriptTypes(await readFile('lib/demo-session.ts', 'utf8')),
          ),
        ),
      );
    const api = await import(url(source));
    const created = await api.changeDemoRoom('host', {
      action: 'create',
      episode: 1,
      position: 20,
    });
    await assert.rejects(
      api.demoRoomSnapshot(created.room.code, 'outsider'),
      /Войдите/,
    );
    const joined = await api.changeDemoRoom('guest', {
      action: 'join',
      code: created.room.code,
    });
    assert.equal(joined.host, false);
    assert.equal(joined.members.length, 2);
    assert.equal(joined.members.find(member => member.user_id === 'host').legend_origin_at, 1800000000000);
    await assert.rejects(
      api.changeDemoRoom('guest', {
        action: 'state',
        code: created.room.code,
        version: 1,
        episode: 2,
        position: 0,
        playing: true,
        rate: 1,
      }),
      /ведущий/,
    );
    const changed = await api.changeDemoRoom('host', {
      action: 'state',
      code: created.room.code,
      version: 1,
      episode: 2,
      position: 123,
      playing: true,
      rate: 1.25,
    });
    const remote = await api.demoRoomSnapshot(created.room.code, 'guest');
    assert.equal(remote.room.episode, 2);
    assert.equal(remote.room.position, 123);
    assert.equal(remote.room.playing, true);
    assert.equal(remote.room.rate, 1.25);
    await assert.rejects(
      api.changeDemoRoom('host', {
        action: 'state',
        code: created.room.code,
        version: 1,
        episode: 1,
        position: 0,
        playing: false,
        rate: 1,
      }),
      /обновилось/,
    );
    await api.saveDemoProgress('host', {
      episode: 1,
      position: 222,
      voice: 'anistar',
      updatedAt: Date.now() - 1000,
    });
    await api.saveDemoProgress('host', {
      episode: 1,
      position: 10,
      voice: 'anistar',
      updatedAt: Date.now() - 10000,
    });
    assert.equal((await api.getDemoProgress('host'))[0].position, 222);
    assert.deepEqual(await api.getDemoProgress('guest'), []);
    await api.changeDemoRoom('host', {
      action: 'leave',
      code: changed.room.code,
    });
    await assert.rejects(
      api.demoRoomSnapshot(created.room.code, 'guest'),
      /завершена/,
    );
  } finally {
    await engine.close();
    delete globalThis.demoFeatureDb;
  }
});
