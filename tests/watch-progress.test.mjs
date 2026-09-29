import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = await readFile(
  new URL('../lib/watch-progress.ts', import.meta.url),
  'utf8',
);
const progress = await import(
  'data:text/javascript;base64,' +
    Buffer.from(stripTypeScriptTypes(source)).toString('base64')
);

test('Kodik episodes outside the AniLiberty cache remain trackable', () => {
  const cached = JSON.stringify([
    { ordinal: 1, duration: 1500 },
    { ordinal: 2, duration: 1500 },
  ]);
  const payload = JSON.stringify({
    seasons: {
      1: { episodes: { 590: 'link', 600: 'link', 610: 'link' } },
    },
  });

  assert.equal(progress.cachedEpisodeDuration(cached, 590), null);
  assert.equal(progress.kodikSourceHasEpisode(payload, 1180, 590), true);
  assert.equal(progress.kodikSourceHasEpisode(payload, 1180, 591), false);
});

test('Kodik voiceover IDs resolve to their source translation', () => {
  assert.equal(progress.kodikTranslationId('kodik:voice:739'), 739);
  assert.equal(progress.kodikTranslationId('kodik:subtitles:869'), 869);
  assert.equal(progress.kodikTranslationId('aniliberty'), null);
});
