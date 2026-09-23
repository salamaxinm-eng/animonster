import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = await readFile(
  new URL('../lib/kodik-events.ts', import.meta.url),
  'utf8',
);
const events = await import(
  'data:text/javascript;base64,' +
    Buffer.from(stripTypeScriptTypes(source)).toString('base64')
);

test('Kodik current episode event exposes internally selected episode', () => {
  assert.equal(
    events.kodikEpisodeFromMessage({
      key: 'kodik_player_current_episode',
      value: {
        episode: 103,
        season: 1,
        translation: { id: 610, title: 'AniLibria.TV' },
      },
    }),
    103,
  );
});

test('Kodik time events are not mistaken for episode changes', () => {
  assert.equal(
    events.kodikEpisodeFromMessage({
      key: 'kodik_player_time_update',
      value: 103,
    }),
    null,
  );
});

test('legacy episode event shapes stay supported', () => {
  assert.equal(
    events.kodikEpisodeFromMessage({
      key: 'kodik_player_episode_changed',
      episode_number: '104',
    }),
    104,
  );
});
