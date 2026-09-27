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
  assert.equal(plans.subscriptionPlans.monthly.price, '109.00');
  assert.equal(plans.subscriptionPlans.monthly.originalPriceLabel, '149 ₽');
  assert.equal(plans.subscriptionPlans.annual.price, '999.00');
  assert.equal(plans.subscriptionPlans.annual.discount, 24);
  assert.equal(plans.subscriptionPlan('annual').id, 'annual');
  assert.equal(plans.subscriptionPlan('unknown'), null);
  assert.equal(plans.supportAmount(110), 110);
  assert.equal(plans.supportAmount('1000'), 1000);
  assert.equal(plans.supportAmount(109), null);
  assert.equal(plans.supportAmount(110.5), null);
  assert.equal(plans.supportAmount(100001), null);
});
