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
      { ...season, seasons: { 1: { ...season.seasons[1], link: 'https://example.com/season/one' } } },
      1,
      exact,
    ),
    null,
  );
});
