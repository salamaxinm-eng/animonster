import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';

const moduleUrl = (source) =>
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const animeSource = stripTypeScriptTypes(
  await readFile(new URL('../lib/anime.ts', import.meta.url), 'utf8'),
);
const animeUrl = moduleUrl(animeSource);
const stored = {
  id: 'one-piece-voice',
  type: 'anime-serial',
  shikimori_id: 21,
  title: 'One Piece',
  translation: { id: 91, title: 'Kodik Voice', type: 'voice' },
  link: 'https://kodik.info/serial/one-piece',
  episodes_count: 1176,
  material_data: {
    anime_genres: ['Приключения', 'Сёнен', 'Фэнтези', 'Экшен'],
    anime_description:
      'Тысячи авантюристов устремились на поиски легендарного сокровища.',
  },
  seasons: {
    1: {
      episodes: {
        1: 'https://kodik.info/one',
        1176: 'https://kodik.info/last',
      },
    },
  },
};
const coreUrl = moduleUrl(`
export const runtime = () => ({});
export const now = () => 0;
export const db = () => ({ prepare: () => ({ bind: () => ({ all: async () => ({ results: [{ payload: ${JSON.stringify(JSON.stringify(stored))} }] }) }) }) });
`);
const kodikSource = stripTypeScriptTypes(
  await readFile(new URL('../lib/server/kodik.ts', import.meta.url), 'utf8'),
)
  .replace("from '@/lib/anime'", `from '${animeUrl}'`)
  .replace("from '@/lib/server/core'", `from '${coreUrl}'`);
const kodik = await import(moduleUrl(kodikSource));

const published = {
  id: 56733,
  shikimori_id: 56733,
  name: 'Magical Explorer',
  russian: 'Магический исследователь',
  image: { original: '' },
  score: '0',
  kind: 'tv',
  episodes: 13,
  aired_on: '2026',
  is_adult: false,
};
const publishedSource = {
  ...stored,
  id: 'magical-explorer-voice',
  shikimori_id: 56733,
  title: published.russian,
  episodes_count: 3,
  material_data: { anime_genres: ['Гарем', 'Этти', 'Комедия'] },
  seasons: {
    1: {
      episodes: {
        1: 'https://kodikplayer.com/seria/one',
        3: 'https://kodikplayer.com/seria/three',
      },
    },
  },
};

test('published anime keeps its matching players despite catalog discovery genre filters', () => {
  assert.equal(kodik.allowedKodikResult(publishedSource), false);
  const voices = kodik.normalizeKodikVoiceovers([publishedSource], published);
  assert.equal(voices.length, 1);
  assert.equal(voices[0].episodes, 3);
  assert.deepEqual(voices[0].episode_ordinals, [1, 3]);
  for (const changed of [
    { shikimori_id: 21 },
    { blocked_countries: ['RU'] },
    { link: 'https://example.com/player' },
    { camrip: true },
    { translation: { id: 91, title: 'Invalid', type: 'unknown' } },
  ])
    assert.equal(
      kodik.normalizeKodikVoiceovers(
        [{ ...publishedSource, ...changed }],
        published,
      ).length,
      0,
    );
});

test('published sources are persisted for player routing and subsequent cached requests', async () => {
  const state = { rows: [], saved: [] };
  globalThis.kodikPlaybackTestState = state;
  const persistenceCore = moduleUrl(`
    export const runtime=()=>({}); export const now=()=>1000;
    export const db=()=>({
      prepare(sql) { return { bind(...args) { return { sql,args,all:async()=>({results:globalThis.kodikPlaybackTestState.rows}),run:async()=>({}) }; } }; },
      async batch(statements) { for(const s of statements) { globalThis.kodikPlaybackTestState.saved.push(s); if(s.sql.includes('INSERT INTO anime_sources')) globalThis.kodikPlaybackTestState.rows.push({payload:s.args[8],last_seen_at:1000}); } }
    });
  `);
  const persisted = await import(
    moduleUrl(
      kodikSource.replace(`from '${coreUrl}'`, `from '${persistenceCore}'`),
    )
  );
  await persisted.rememberKodikSources(published.id, [publishedSource]);
  assert.equal(state.rows.length, 0, 'discovery policy is unchanged');
  await persisted.rememberKodikSources(
    published.id,
    [publishedSource, { ...publishedSource, shikimori_id: 21 }],
    published,
  );
  assert.equal(state.rows.length, 1, 'only the matching source is saved');
  const result = await persisted.kodikVoiceovers(published);
  assert.equal(result.status, 'ready');
  assert.equal(
    result.voiceovers[0].player_url,
    '/api/kodik/player?anime_id=56733&translation=91',
  );
  delete globalThis.kodikPlaybackTestState;
});

test('cached Kodik source remains available when only the sync worker has a token', async () => {
  const result = await kodik.kodikVoiceovers({
    id: 21,
    name: 'One Piece',
    russian: 'Ван-Пис',
    image: { original: '' },
    score: '0',
    kind: 'tv',
    episodes: 1176,
    aired_on: '1999-10-20',
  });
  assert.equal(result.status, 'ready');
  assert.equal(result.voiceovers[0].episodes, 1176);
  assert.deepEqual(result.voiceovers[0].episode_ordinals, [1, 1176]);
  assert.equal(
    result.voiceovers[0].player_url,
    '/api/kodik/player?anime_id=21&translation=91',
  );
});

test('AniLibria remains available as a voiceover inside the Kodik player', () => {
  const voiceovers = kodik.normalizeKodikVoiceovers(
    [
      {
        ...stored,
        id: 'one-piece-anilibria',
        translation: { id: 92, title: 'AniLibria.TV', type: 'voice' },
      },
    ],
    {
      id: 21,
      name: 'One Piece',
      russian: 'Ван-Пис',
      image: { original: '' },
      score: '0',
      kind: 'tv',
      episodes: 1176,
      aired_on: '1999-10-20',
    },
  );

  assert.equal(voiceovers.length, 1);
  assert.equal(voiceovers[0].title, 'AniLibria.TV');
  assert.equal(voiceovers[0].provider, 'kodik');
  assert.equal(
    voiceovers[0].player_url,
    '/api/kodik/player?anime_id=21&translation=92',
  );
});

test('invalid episode links are not advertised as playable episodes', () => {
  const result = kodik.normalizeKodikVoiceovers(
    [
      {
        ...stored,
        seasons: {
          1: {
            episodes: {
              1: 'https://kodik.info/one',
              2: 'https://example.com/not-a-kodik-player',
            },
          },
        },
      },
    ],
    {
      id: 21,
      name: 'One Piece',
      russian: 'Ван-Пис',
      image: { original: '' },
      score: '0',
      kind: 'tv',
      episodes: 1176,
      aired_on: '1999-10-20',
    },
  );
  assert.deepEqual(result[0].episode_ordinals, [1]);
  assert.equal(kodik.kodikHasEpisodeMap(stored), true);
  assert.equal(kodik.kodikHasEpisodeMap({ ...stored, seasons: {} }), false);
});

test('Kodik season player is used only for the matching episode link', () => {
  const exact = 'https://kodik.info/seria/first';
  const season = {
    ...stored,
    seasons: {
      1: {
        link: '//kodik.info/season/one',
        episodes: { 1: exact, 2: 'https://kodik.info/seria/second' },
      },
    },
  };
  assert.deepEqual(kodik.kodikSeasonPlayer(season, 1, exact), {
    playerUrl: 'https://kodik.info/season/one',
    episodeOrdinals: [1, 2],
  });
  assert.equal(
    kodik.kodikSeasonPlayer(season, 1, 'https://kodik.info/seria/stale'),
    null,
  );
  assert.equal(
    kodik.kodikSeasonPlayer(
      {
        ...season,
        seasons: {
          1: { ...season.seasons[1], link: 'https://example.com/season/one' },
        },
      },
      1,
      exact,
    ),
    null,
  );
});
