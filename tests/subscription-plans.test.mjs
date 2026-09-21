import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = await readFile(
  new URL('../lib/subscription-plans.ts', import.meta.url),
  'utf8',
);
const plans = await import(
  'data:text/javascript;base64,' +
    Buffer.from(stripTypeScriptTypes(source)).toString('base64')
);

test('annual Plus is 365 days with a ten percent discount', () => {
  assert.equal(plans.subscriptionPlans.annual.days, 365);
  assert.equal(plans.subscriptionPlans.annual.price, '961.20');
  assert.equal(plans.subscriptionPlans.annual.discount, 10);
  assert.equal(plans.subscriptionPlan('annual').id, 'annual');
  assert.equal(plans.subscriptionPlan('unknown'), null);
});
