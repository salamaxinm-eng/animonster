import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = (
  await readFile(new URL('../lib/server/billing.ts', import.meta.url), 'utf8')
)
  .replace(
    "import { db, runtime, ApiError, now } from './core';",
    'const db = () => { throw new Error("not used"); }; const runtime = () => ({}); class ApiError extends Error {}; const now = () => 0;',
  )
  .replace(
    "import { refreshSupporterChampion } from './supporters';",
    'const refreshSupporterChampion = async () => {};',
  )
  .replace(
    "import { assignFounder, syncFounderRewards } from './founders';",
    'const assignFounder = async () => {}; const syncFounderRewards = async () => {};',
  )
  .replace(
    "import { PLUS_DURATION_MS, PLUS_PRICE } from './plus';",
    "const PLUS_DURATION_MS = 0; const PLUS_PRICE = '109.00';",
  );

const billing = await import(
  'data:text/javascript;base64,' +
    Buffer.from(stripTypeScriptTypes(source)).toString('base64')
);

test('payment amount accepts provider commission added to customer charge', () => {
  assert.equal(billing.validPaymentAmount(121.46, 109, 12.46), true);
  assert.equal(billing.validPaymentAmount(109, 109, 12.46), true);
});

test('payment amount rejects underpayment and unrelated overpayment', () => {
  assert.equal(billing.validPaymentAmount(108.99, 109, 0), false);
  assert.equal(billing.validPaymentAmount(121.46, 109, 10), false);
});
