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
    'https://kodik.info/serial/one-piece',
  );
});
