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

test('Plus prices include annual discount and a validated custom tier', () => {
  assert.equal(plans.subscriptionPlans.annual.days, 365);
  assert.equal(plans.subscriptionPlans.monthly.price, '89.00');
  assert.equal(plans.subscriptionPlans.annual.price, '961.20');
  assert.equal(plans.subscriptionPlans.annual.discount, 10);
  assert.equal(plans.subscriptionPlan('annual').id, 'annual');
  assert.equal(plans.subscriptionPlan('unknown'), null);
  assert.equal(plans.supportAmount(90), 90);
  assert.equal(plans.supportAmount('1000'), 1000);
  assert.equal(plans.supportAmount(89), null);
  assert.equal(plans.supportAmount(90.5), null);
  assert.equal(plans.supportAmount(100001), null);
});
