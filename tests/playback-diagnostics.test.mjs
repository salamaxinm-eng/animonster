import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = stripTypeScriptTypes(
  await readFile(
    new URL('../lib/playback-diagnostics.ts', import.meta.url),
    'utf8',
  ),
);
const diagnostics = await import(
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
);

test('playback diagnostics accept only bounded Kodik failure data', () => {
  assert.deepEqual(
    diagnostics.normalizePlaybackDiagnostic({
      anime_id: 269,
      episode: 68,
      voiceover: 'kodik:voice:609',
      code: 'no_player_signal',
      phase: 'load',
      details: {
        online: true,
        visibility: 'visible',
        iframe_loaded: true,
        elapsed_ms: 25001,
        player_code: 'network:error <secret>',
      },
    }),
    {
      provider: 'kodik',
      animeId: 269,
      episode: 68,
      voiceover: 'kodik:voice:609',
      code: 'no_player_signal',
      phase: 'load',
      details: {
        online: true,
        visibility: 'visible',
        iframe_loaded: true,
        elapsed_ms: 25001,
        player_code: 'network:errorsecret',
      },
    },
  );
  assert.equal(
    diagnostics.normalizePlaybackDiagnostic({
      anime_id: 269,
      episode: 68,
      voiceover: 'aniliberty',
      code: 'arbitrary',
      phase: 'load',
    }),
    null,
  );
});
