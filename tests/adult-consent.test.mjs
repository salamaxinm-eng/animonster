import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

const source = await readFile(
  new URL('../lib/adult-consent.ts', import.meta.url),
  'utf8',
);
const moduleUrl = `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`;
const { adultConsentCookie, hasAdultConsent } = await import(moduleUrl);

test('recognizes only the explicit adult consent cookie', () => {
  assert.equal(hasAdultConsent('theme=dark; am_adult_confirmed=1'), true);
  assert.equal(hasAdultConsent('am_adult_confirmed=0'), false);
  assert.equal(hasAdultConsent('other_am_adult_confirmed=1'), false);
});

test('adult consent cookie is persistent and secure on HTTPS', () => {
  const value = adultConsentCookie(true);
  assert.match(value, /Max-Age=31536000/);
  assert.match(value, /SameSite=Lax/);
  assert.match(value, /; Secure$/);
});
