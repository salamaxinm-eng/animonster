import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

const source = await readFile(
  new URL('../lib/age-rating.ts', import.meta.url),
  'utf8',
);
const moduleUrl = `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`;
const { shikimoriAgeRating } = await import(moduleUrl);

test('maps Shikimori audience ratings to age labels', () => {
  assert.deepEqual(shikimoriAgeRating('g'), { label: '0+', isAdult: false });
  assert.deepEqual(shikimoriAgeRating('pg'), { label: '6+', isAdult: false });
  assert.deepEqual(shikimoriAgeRating('pg_13'), {
    label: '13+',
    isAdult: false,
  });
  assert.deepEqual(shikimoriAgeRating('r'), { label: '17+', isAdult: false });
});

test('only adult Shikimori ratings enable the adult gate', () => {
  assert.deepEqual(shikimoriAgeRating('r_plus'), {
    label: '18+',
    isAdult: true,
  });
  assert.deepEqual(shikimoriAgeRating('rx'), { label: '18+', isAdult: true });
  assert.equal(shikimoriAgeRating('unknown'), null);
});
