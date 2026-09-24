import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = stripTypeScriptTypes(
  await readFile(new URL('../lib/referral-url.ts', import.meta.url), 'utf8'),
);
const referral = await import(
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
);

test('referral links use the public origin instead of the container address', () => {
  assert.equal(
    referral.referralUrl('5shauvsk', 'https://animonster.su'),
    'https://animonster.su/ref/5SHAUVSK',
  );
});
