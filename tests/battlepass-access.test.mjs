import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

void test('owner preview hides the pass from guests and other accounts', async () => {
  const source = stripTypeScriptTypes(await readFile('lib/server/battlepass-access.ts', 'utf8'))
    .replace("'./core'", "'data:text/javascript,export const runtime=()=>globalThis.passAccessRuntime;export class ApiError extends Error{constructor(message,status){super(message);this.status=status}}'");
  const { canViewBattlepass, requireBattlepassAccess } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  try {
    globalThis.passAccessRuntime = { BATTLEPASS_PREVIEW_USER_ID: 'owner' };
    assert.equal(canViewBattlepass(null), false);
    assert.equal(canViewBattlepass({ id: 'another' }), false);
    assert.equal(canViewBattlepass({ id: 'owner' }), true);
    assert.throws(() => requireBattlepassAccess({ id: 'another' }), { status: 404 });
    globalThis.passAccessRuntime = {};
    assert.equal(canViewBattlepass(null), true);
  } finally {
    delete globalThis.passAccessRuntime;
  }
});
