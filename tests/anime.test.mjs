import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = await readFile(
  new URL('../lib/anime.ts', import.meta.url),
  'utf8',
);
const anime = await import(
  'data:text/javascript;base64,' +
    Buffer.from(stripTypeScriptTypes(source)).toString('base64')
);

test('Kodik player path stays on the public site origin', () => {
  const path = anime.kodikPlayerPath(61642, '123');
  assert.equal(path, '/api/kodik/player?anime_id=61642&translation=123');
  assert.equal(
    new URL(path, 'https://animonster.su').origin,
    'https://animonster.su',
  );
});

test('a source can expose non-contiguous Kodik episodes', () => {
  const episodes = [1, 2, 3, 4].map((ordinal) => ({ ordinal }));
  const source = {
    id: 'kodik:voice:42',
    provider: 'kodik',
    episodes: 4,
    episode_ordinals: [1, 3, 4],
  };
  assert.deepEqual(anime.voiceoverEpisodeIndices(episodes, source), [0, 2, 3]);
});

test('the source with the requested episode and largest catalogue is selected', () => {
  const selected = anime.initialVoiceover(
    [
      { id: 'aniliberty', provider: 'aniliberty', episodes: 11 },
      { id: 'kodik:voice:7', provider: 'kodik', episodes: 1176 },
    ],
    1,
  );
  assert.equal(selected.id, 'kodik:voice:7');
});
