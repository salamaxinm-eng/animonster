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
    "import { PLUS_DURATION_MS, PLUS_PRICE } from './plus';",
    "const PLUS_DURATION_MS = 0; const PLUS_PRICE = '89.00';",
  );

const billing = await import(
  'data:text/javascript;base64,' +
    Buffer.from(stripTypeScriptTypes(source)).toString('base64')
);

test('payment amount accepts provider commission added to customer charge', () => {
  assert.equal(billing.validPaymentAmount(101.46, 89, 12.46), true);
  assert.equal(billing.validPaymentAmount(89, 89, 12.46), true);
});

test('payment amount rejects underpayment and unrelated overpayment', () => {
  assert.equal(billing.validPaymentAmount(88.99, 89, 0), false);
  assert.equal(billing.validPaymentAmount(101.46, 89, 10), false);
});
