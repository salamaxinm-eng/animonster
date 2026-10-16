import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

const source = (await readFile('lib/server/payment-gateway.ts', 'utf8')).replace(
  "import { ApiError, runtime } from './core';",
  'const runtime=()=>globalThis.casheraTestConfig; class ApiError extends Error { constructor(message,status){super(message);this.status=status;} }',
);
const gateway = await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64'));

void test('Cashera configuration, checkout timeout recovery and invalid provider responses', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.casheraTestConfig = {
    PAYMENTS_ENABLED: 'true', PAYMENTS_PROVIDER: 'cashera',
    CASHERA_API_KEY: 'pk_test', CASHERA_API_SECRET: 'sk_test',
  };
  const config = globalThis.casheraTestConfig;
  const input = {
    orderId: crypto.randomUUID(), amount: 104.3, description: 'VPN по промокоду',
    origin: 'https://animonster.test', successUrl: 'https://animonster.test/vpn?payment=return',
    failUrl: 'https://animonster.test/vpn?payment=failed', metadata: { userId: 'test' },
  };
  const transaction = {
    uuid: crypto.randomUUID(), external_id: input.orderId, amount: 10430,
    type: 'deposit', currency: 'RUB', status: 'pending', payment_url: 'https://pay.cashera.cash/checkout',
  };
  try {
    assert.equal(gateway.paymentProvider(), 'cashera');
    assert.equal(gateway.paymentsReady(), true);
    config.CASHERA_API_SECRET = '';
    assert.equal(gateway.paymentsReady(), false);
    config.CASHERA_API_SECRET = 'sk_test';
    config.PAYMENTS_PROVIDER = 'unknown';
    assert.equal(gateway.paymentsReady(), false);
    assert.throws(() => gateway.paymentProvider());
    config.PAYMENTS_PROVIDER = 'cashera';

    const requests = [];
    globalThis.fetch = async (url, init) => {
      requests.push({ url, init });
      if (init.method === 'POST') {
        const payload = JSON.parse(init.body);
        assert.equal(payload.amount, 10430);
        assert.equal(payload.external_id, input.orderId);
        assert.equal('payment_method' in payload, false);
        assert.equal(payload.callback_url, input.origin + '/api/payments/cashera/webhook');
        // Accepted upstream; only the response was lost.
        throw new TypeError('network error');
      }
      assert.ok(url.endsWith('/by-external-id/' + input.orderId));
      return Response.json(transaction);
    };
    assert.deepEqual(await gateway.createCasheraCheckout(input), {id: transaction.uuid, url: transaction.payment_url});
    assert.equal(requests.filter(request => request.init.method === 'POST').length, 1);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].init.headers['X-Secret'], undefined);
    assert.equal(requests[0].init.redirect, 'error');

    for (const [field, value] of [
      ['amount', 10429], ['amount', 10431], ['amount', '10430'],
      ['amount', 10430.5], ['currency', 'USD'], ['type', 'withdraw'],
      ['external_id', 'another-order'], ['uuid', 'invalid'],
      ['payment_url', 'http://pay.cashera.cash/test'], ['payment_url', 'javascript:alert(1)'],
      ['payment_url', 'https://user:secret@pay.cashera.cash/test'],
    ]) {
      globalThis.fetch = async () => Response.json({...transaction, [field]: value});
      await assert.rejects(gateway.createCasheraCheckout(input));
    }
    config.PAYMENTS_ENABLED = 'false';
    assert.equal(gateway.paymentsReady(), false);
    globalThis.fetch = async () => Response.json(transaction);
    assert.equal((await gateway.casheraFetch('/' + transaction.uuid)).uuid, transaction.uuid);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.casheraTestConfig;
  }
});
