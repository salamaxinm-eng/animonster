import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { PGlite } from '@electric-sql/pglite';

const moduleUrl = (source) => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');

function database(engine) {
  const client = (connection) => ({
    prepare(source) {
      let values = [];
      let index = 0;
      const sql = source.replace(/\?/g, () => '$' + ++index);
      const execute = async () => connection.query(sql, values);
      return {
        bind(...params) { values = params; return this; },
        async first() { return (await execute()).rows[0] ?? null; },
        async all() { return { results: (await execute()).rows }; },
        async run() { return execute(); },
      };
    },
    transaction(callback) { return connection.transaction((tx) => callback(client(tx))); },
  });
  return client(engine);
}

test('VPN devices are limited, issued per user, revoked and expired', async () => {
  const engine = new PGlite();
  await engine.exec('CREATE TABLE users (id text PRIMARY KEY, deleted_at bigint)');
  await engine.exec("INSERT INTO users(id) VALUES ('one'),('two')");
  await engine.exec(await readFile('migrations/postgres/0041_vpn_access.sql', 'utf8'));
  await engine.exec(`CREATE TABLE orders (id text PRIMARY KEY,user_id text,plan text,
    status text,provider_id text,confirmed_at bigint,is_test boolean,
    provider text DEFAULT 'platega',amount numeric DEFAULT 149,duration_days integer DEFAULT 30,
    fundraising_goal_id text NOT NULL DEFAULT 'player',
    CONSTRAINT orders_plan_check CHECK (plan IN ('monthly','annual','support','donation')))`);
  await engine.exec(await readFile('migrations/postgres/0042_vpn_payments.sql', 'utf8'));
  await engine.exec(await readFile('migrations/postgres/0043_vpn_plus_bundle.sql', 'utf8'));
  await engine.exec(`CREATE TABLE grants (order_id text PRIMARY KEY,user_id text NOT NULL,
    starts_at bigint NOT NULL,expires bigint NOT NULL,reason text,revoked_at bigint,
    lifetime boolean NOT NULL DEFAULT false)`);
  globalThis.vpnTestDb = database(engine);
  globalThis.vpnTestRuntime = {
    VPN_CONFIG_KEY: randomBytes(32).toString('base64'),
    VPN_AGENT_TOKEN: 'a'.repeat(48),
  };
  const core = moduleUrl(`
    export const db = () => globalThis.vpnTestDb;
    export const now = () => Date.now();
    export const uid = () => crypto.randomUUID();
    export const runtime = () => globalThis.vpnTestRuntime;
    export class ApiError extends Error {
      constructor(message,status=400,code='request_failed') {
        super(message); this.status=status; this.code=code;
      }
    }
  `);
  const source = stripTypeScriptTypes(await readFile('lib/server/vpn.ts', 'utf8'))
    .replace("'./core'", JSON.stringify(core))
    .replace("'../vpn-plan'", JSON.stringify(moduleUrl("export const VPN_PLAN={id:'vpn',days:30,price:'149.00'}; export const VPN_PLUS_PLAN={id:'vpn_plus',days:30,price:'199.00'};")));
  const vpnUrl = moduleUrl(source);
  const vpn = await import(vpnUrl);
  await vpn.grantPilotVpnDays('one', 1);

  await assert.rejects(vpn.addVpnDevice('two', 'Phone'), /подписка/);
  const first = await vpn.addVpnDevice('one', 'Phone');
  const claimed = await vpn.claimVpnJob();
  assert.equal(claimed.action, 'create');
  assert.equal(claimed.device.slot, 3);
  await vpn.completeVpnJob({ id: claimed.id, leaseId: claimed.lease_id,
    profile: { awg: '[Interface]\nPrivateKey = sample', xray: 'vless://sample' } });
  assert.match((await vpn.getVpnProfile('one', first.id)).awg, /PrivateKey/);
  await assert.rejects(vpn.getVpnProfile('two', first.id), /недоступен/);
  for (let index = 0; index < 4; index++) await vpn.addVpnDevice('one', `Device ${index}`);
  await assert.rejects(vpn.addVpnDevice('one', 'Sixth'), /пяти устройств/);

  await vpn.revokeVpnDevice('one', first.id);
  await assert.rejects(vpn.getVpnProfile('one', first.id), /недоступен/);
  const jobs = [];
  for (let index = 0; index < 5; index++) {
    const job = await vpn.claimVpnJob();
    jobs.push(job);
    await vpn.completeVpnJob({ id: job.id, leaseId: job.lease_id,
      ...(job.action === 'create' ? { profile: { awg: 'a', xray: 'x' } } : {}) });
  }
  assert.equal(jobs.at(-1).action, 'revoke');
  assert.equal((await vpn.vpnOverview('one')).devices.length, 4);
  await engine.exec(`INSERT INTO orders(id,user_id,plan,status) VALUES
    ('pay-1','two','vpn','pending'),('pay-2','two','vpn','pending')`);
  await vpn.confirmVpnPayment('pay-1', 'two', 'provider-1', false);
  const firstPaidExpiry = (await vpn.vpnOverview('two')).expiresAt;
  await vpn.confirmVpnPayment('pay-1', 'two', 'provider-1', false);
  assert.equal((await vpn.vpnOverview('two')).expiresAt, firstPaidExpiry);
  await vpn.confirmVpnPayment('pay-2', 'two', 'provider-2', false);
  const twoPaidExpiry = (await vpn.vpnOverview('two')).expiresAt;
  assert.equal(twoPaidExpiry, firstPaidExpiry + 30 * 86400000);
  const paidDevice = await vpn.addVpnDevice('two', 'Paid phone');
  await vpn.revokeVpnPayment('pay-1', 'two', 'chargebacked');
  const afterFirstRefund = (await vpn.vpnOverview('two')).expiresAt;
  assert.ok(afterFirstRefund < twoPaidExpiry);
  assert.ok(afterFirstRefund >= firstPaidExpiry);
  assert.equal((await vpn.vpnOverview('two')).active, true);
  await vpn.confirmVpnPayment('pay-1', 'two', 'provider-1', false);
  assert.equal((await vpn.vpnOverview('two')).expiresAt, afterFirstRefund);
  await vpn.revokeVpnPayment('pay-2', 'two', 'chargebacked');
  assert.equal((await vpn.vpnOverview('two')).active, false);
  assert.equal((await vpn.vpnOverview('two')).devices.find((d) => d.id === paidDevice.id).status, 'revoking');
  assert.equal((await engine.query("SELECT COUNT(*)::int AS count FROM vpn_entitlements WHERE user_id='two' AND revoked_at IS NULL")).rows[0].count, 0);
  const billingSource = stripTypeScriptTypes(await readFile('lib/server/billing.ts', 'utf8'))
    .replace("'./core'", JSON.stringify(core))
    .replace("'./vpn'", JSON.stringify(vpnUrl))
    .replace("'./supporters'", JSON.stringify(moduleUrl('export const refreshSupporterChampion=async()=>{};')))
    .replace("'./founders'", JSON.stringify(moduleUrl('export const assignFounder=async()=>{}; export const syncFounderRewards=async()=>{};')));
  const billing = await import(moduleUrl(billingSource));
  globalThis.vpnTestRuntime.PAYMENTS_ENABLED = 'true';
  globalThis.vpnTestRuntime.PLATEGA_MERCHANT_ID = 'merchant';
  globalThis.vpnTestRuntime.PLATEGA_SECRET_KEY = 'secret';
  await engine.exec("INSERT INTO orders(id,user_id,plan,status,provider_id) VALUES ('pay-3','two','vpn','pending','provider-3')");
  const originalFetch = globalThis.fetch;
  let providerStatus = 'CONFIRMED';
  let providerId = 'provider-3';
  let orderId = 'pay-3';
  let amount = 149;
  globalThis.fetch = async () => Response.json({ id: providerId, payload: orderId,
    status: providerStatus, paymentDetails: { amount, currency: 'RUB' } });
  try {
    assert.equal(await billing.verifyPayment('provider-3'), 'succeeded');
    const paid = (await vpn.vpnOverview('two')).expiresAt;
    assert.equal(await billing.verifyPayment('provider-3'), 'succeeded');
    assert.equal((await vpn.vpnOverview('two')).expiresAt, paid);
    providerStatus = 'CHARGEBACKED';
    assert.equal(await billing.verifyPayment('provider-3'), 'chargebacked');
    assert.equal((await vpn.vpnOverview('two')).active, false);
    await engine.exec(`INSERT INTO orders(id,user_id,plan,status,provider_id,amount)
      VALUES ('bundle-1','two','vpn_plus','pending','bundle-provider-1',199)`);
    providerId = 'bundle-provider-1';
    orderId = 'bundle-1';
    amount = 199;
    providerStatus = 'CONFIRMED';
    assert.equal(await billing.verifyPayment(providerId), 'succeeded');
    const bundleVpnExpiry = (await vpn.vpnOverview('two')).expiresAt;
    const bundlePlus = await engine.query("SELECT expires,revoked_at FROM grants WHERE order_id='bundle-1'");
    assert.equal(bundlePlus.rows.length, 1);
    assert.equal(bundlePlus.rows[0].revoked_at, null);
    assert.ok(Number(bundlePlus.rows[0].expires) > Date.now());
    assert.equal(await billing.verifyPayment(providerId), 'succeeded');
    assert.equal((await vpn.vpnOverview('two')).expiresAt, bundleVpnExpiry);
    assert.equal((await engine.query("SELECT COUNT(*)::int AS n FROM grants WHERE user_id='two'")).rows[0].n, 1);
    await engine.exec(`INSERT INTO orders(id,user_id,plan,status,provider_id,amount)
      VALUES ('bundle-2','two','vpn_plus','pending','bundle-provider-2',199)`);
    providerId = 'bundle-provider-2';
    orderId = 'bundle-2';
    assert.equal(await billing.verifyPayment(providerId), 'succeeded');
    const bothVpnExpiry = (await vpn.vpnOverview('two')).expiresAt;
    const bothPlusExpiry = Number((await engine.query("SELECT expires FROM grants WHERE order_id='bundle-2'")).rows[0].expires);
    assert.equal(bothVpnExpiry, bundleVpnExpiry + 30 * 86400000);
    assert.equal(bothPlusExpiry, Number(bundlePlus.rows[0].expires) + 30 * 86400000);
    providerId = 'bundle-provider-1';
    orderId = 'bundle-1';
    providerStatus = 'CHARGEBACKED';
    assert.equal(await billing.verifyPayment(providerId), 'chargebacked');
    assert.equal((await vpn.vpnOverview('two')).active, true);
    assert.ok((await vpn.vpnOverview('two')).expiresAt < bothVpnExpiry);
    assert.ok((await engine.query("SELECT revoked_at FROM grants WHERE order_id='bundle-1'")).rows[0].revoked_at);
    const remainingPlusExpiry = Number((await engine.query("SELECT expires FROM grants WHERE order_id='bundle-2'")).rows[0].expires);
    assert.ok(remainingPlusExpiry < bothPlusExpiry);
    assert.ok(remainingPlusExpiry >= Number(bundlePlus.rows[0].expires));
    providerId = 'bundle-provider-2';
    orderId = 'bundle-2';
    assert.equal(await billing.verifyPayment(providerId), 'chargebacked');
    assert.equal((await vpn.vpnOverview('two')).active, false);
    assert.equal((await engine.query("SELECT COUNT(*)::int AS n FROM grants WHERE user_id='two' AND revoked_at IS NULL")).rows[0].n, 0);
    const plusStart = Date.now();
    await engine.query(`INSERT INTO orders(id,user_id,plan,status,provider_id,amount,confirmed_at)
      VALUES ('plus-only','two','monthly','succeeded','plus-provider',109,$1)`, [plusStart]);
    await engine.query(`INSERT INTO grants(order_id,user_id,starts_at,expires)
      VALUES ('plus-only','two',$1,$2)`, [plusStart, plusStart + 30 * 86400000]);
    await engine.exec(`INSERT INTO orders(id,user_id,plan,status,provider_id,amount)
      VALUES ('bundle-3','two','vpn_plus','pending','bundle-provider-3',199)`);
    providerId = 'bundle-provider-3';
    orderId = 'bundle-3';
    providerStatus = 'CONFIRMED';
    assert.equal(await billing.verifyPayment(providerId), 'succeeded');
    assert.ok(Number((await engine.query("SELECT expires FROM grants WHERE order_id='bundle-3'")).rows[0].expires) > plusStart + 30 * 86400000);
    providerStatus = 'CHARGEBACKED';
    assert.equal(await billing.verifyPayment(providerId), 'chargebacked');
    assert.equal(Number((await engine.query("SELECT expires FROM grants WHERE order_id='plus-only'")).rows[0].expires), plusStart + 30 * 86400000);
    assert.equal((await engine.query("SELECT COUNT(*)::int AS n FROM grants WHERE user_id='two' AND revoked_at IS NULL")).rows[0].n, 1);
    assert.equal((await vpn.vpnOverview('two')).active, false);
  } finally { globalThis.fetch = originalFetch; }
  await engine.query('UPDATE vpn_subscriptions SET expires_at=$1 WHERE user_id=$2', [Date.now() - 1, 'one']);
  await vpn.queueExpiredVpnDevices();
  assert.equal((await vpn.vpnOverview('one')).devices.filter((device) => device.status === 'revoking').length, 4);
  await engine.close();
});
