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
