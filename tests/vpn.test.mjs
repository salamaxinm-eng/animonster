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
    .replace("'./core'", JSON.stringify(core));
  const vpn = await import(moduleUrl(source));
  const expires = (await vpn.grantPilotVpnDays('one', 1)).expiresAt;

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
  await engine.query('UPDATE vpn_subscriptions SET expires_at=$1 WHERE user_id=$2', [Date.now() - 1, 'one']);
  await vpn.queueExpiredVpnDevices();
  assert.equal((await vpn.vpnOverview('one')).devices.filter((device) => device.status === 'revoking').length, 4);
  await engine.close();
});
