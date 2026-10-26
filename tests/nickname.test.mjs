import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
const url = (s) =>
  'data:text/javascript;base64,' + Buffer.from(s).toString('base64');
async function load(path, imports = {}) {
  let s = stripTypeScriptTypes(await readFile(path, 'utf8'));
  for (const [a, b] of Object.entries(imports))
    s = s.replaceAll("'" + a + "'", JSON.stringify(b));
  return url(s);
}
function client(connection) {
  return {
    prepare(source) {
      let values = [],
        i = 0;
      const sql = source.replace(/\?/g, () => '$' + ++i);
      const run = () => connection.query(sql, values);
      return {
        bind(...v) {
          values = v;
          return this;
        },
        async first() {
          return (await run()).rows[0] || null;
        },
        async all() {
          return { results: (await run()).rows };
        },
        run,
      };
    },
    transaction: (fn) => connection.transaction((tx) => fn(client(tx))),
  };
}
const sharedUrl = await load('lib/nickname-styles.ts'),
  shared = await import(sharedUrl);
const core = url(
  `export const db=()=>globalThis.nickDb;export const uid=()=>crypto.randomUUID();export const now=()=>1800000000000;export class ApiError extends Error {constructor(message,status=400){super(message);this.status=status;}}`,
);
const serviceUrl = await load('lib/server/nickname.ts', {
    './core': core,
    '../nickname-styles': sharedUrl,
  }),
  service = await import(serviceUrl);
void test('20 distinct colors, six render modes; no purchasable Legend Origin gold', () => {
  assert.equal(shared.nicknameColors.length, 20);
  assert.equal(new Set(shared.nicknameColors.map((c) => c[2])).size, 20);
  assert.equal(shared.nicknameEffects.length, 6);
  assert.ok(!shared.nicknameColors.some((c) => c[0] === 'legend'));
  for (const [color] of shared.nicknameColors)
    for (const [effect] of shared.nicknameEffects)
      assert.ok(shared.validNicknameStyle({ color, effect, motion: true }));
  for (const value of [
    null,
    [],
    {},
    { color: 'red', effect: 'solid', motion: true },
    { color: 'mint', effect: 'hacked', motion: true },
    { color: 'mint', effect: 'solid', motion: 'true' },
  ])
    assert.equal(shared.validNicknameStyle(value), false);
});
void test('permanent purchase: reservations, duplicate confirmations, access boundaries, test charges and refunds', async () => {
  const engine = new PGlite({ extensions: { pg_trgm } });
  globalThis.nickDb = client(engine);
  try {
    const owner = '72a2651c-ee22-48e2-8a2e-eaf81d83e332',
      artyom = '3c199d52-d4c1-48f3-8051-83ccbe5f00a5';
    for (const file of (await readdir('migrations/postgres'))
      .filter((n) => n.endsWith('.sql'))
      .sort()) {
      if (file === '0064_nickname_studio.sql')
        await engine.query(
          `INSERT INTO users(id,identity,nick,created_at,legend_origin_at) VALUES ($1,'test:owner','Owner',1,1),($2,'test:artyom','Artyom',1,1)`,
          [owner, artyom],
        );
      await engine.exec(await readFile('migrations/postgres/' + file, 'utf8'));
    }
    await engine.exec(
      "INSERT INTO users(id,identity,nick,created_at) VALUES ('buyer','vk:buyer','Buyer',1),('test','vk:test','Test',1),('other','vk:other','Other',1)",
    );
    const user = async (id) =>
      (await engine.query('SELECT * FROM users WHERE id=$1', [id])).rows[0];
    assert.equal(service.hasNicknameStudio(await user(owner)), true);
    assert.equal(
      service.hasNicknameStudio(await user(artyom)),
      false,
      'Artyom keeps only honorary gold',
    );
    const style = { color: 'mint', effect: 'shimmer', motion: true };
    assert.throws(
      () =>
        service.validateNicknameChoice({ nickname_unlocked_at: null }, style),
      { status: 403 },
    );
    assert.throws(
      () =>
        service.validateNicknameChoice(
          { nickname_unlocked_at: 1 },
          { color: 'legend', effect: 'shimmer', motion: true },
        ),
      { status: 403 },
    );
    assert.deepEqual(
      service.validateNicknameChoice(await user(artyom), {
        color: 'legend',
        effect: 'metal',
        motion: false,
      }),
      { color: 'legend', effect: 'shimmer', motion: false },
    );
    const artyomUser = await user(artyom);
    assert.throws(() => service.validateNicknameChoice(artyomUser, style), {
      status: 403,
    });
    await assert.rejects(service.reserveNicknameOrder(owner, 'cashera'), {
      status: 409,
    });
    const first = await service.reserveNicknameOrder('buyer', 'cashera');
    await assert.rejects(service.reserveNicknameOrder('buyer', 'cashera'), {
      status: 409,
    });
    await engine.query(
      "UPDATE nickname_purchases SET payment_url='https://pay.example/one' WHERE order_id=$1",
      [first.id],
    );
    const duplicate = await service.reserveNicknameOrder('buyer', 'cashera');
    assert.equal(duplicate.id, first.id);
    assert.equal(duplicate.url, 'https://pay.example/one');
    await service.settleNicknamePayment(
      first.id,
      'provider-first',
      'succeeded',
    );
    await service.settleNicknamePayment(
      first.id,
      'provider-first',
      'succeeded',
    );
    assert.equal(service.hasNicknameStudio(await user('buyer')), true);
    assert.deepEqual(
      service.validateNicknameChoice(await user('buyer'), style),
      style,
    );
    assert.equal(
      (
        await engine.query(
          "SELECT COUNT(*)::int n FROM grants WHERE user_id='buyer'",
        )
      ).rows[0].n,
      0,
      'no Plus grant',
    );
    assert.equal(
      (
        await engine.query(
          "SELECT COUNT(*)::int n FROM founding_members WHERE user_id='buyer'",
        )
      ).rows[0].n,
      0,
      'no founder seat',
    );
    assert.equal(
      (
        await engine.query(
          "SELECT SUM(amount)::int amount FROM orders WHERE user_id='buyer' AND status='succeeded' AND NOT is_test",
        )
      ).rows[0].amount,
      5000,
      'counts once as support',
    );
    await assert.rejects(service.reserveNicknameOrder('buyer', 'cashera'), {
      status: 409,
    });
    await engine.query(
      "UPDATE users SET nickname_style=$1::jsonb WHERE id='buyer'",
      [JSON.stringify(style)],
    );
    await service.settleNicknamePayment(first.id, 'provider-first', 'canceled');
    assert.equal(
      service.hasNicknameStudio(await user('buyer')),
      true,
      'late cancellation does not revoke success',
    );
    await service.settleNicknamePayment(
      first.id,
      'provider-first',
      'chargebacked',
    );
    assert.equal(service.hasNicknameStudio(await user('buyer')), false);
    assert.equal((await user('buyer')).nickname_style, null);
    await service.settleNicknamePayment(
      first.id,
      'provider-first',
      'succeeded',
    );
    assert.equal(
      service.hasNicknameStudio(await user('buyer')),
      false,
      'refund is terminal',
    );
    const retry = await service.reserveNicknameOrder('buyer', 'cashera');
    assert.notEqual(retry.id, first.id);
    await service.settleNicknamePayment(
      retry.id,
      'provider-retry',
      'succeeded',
    );
    const testOrder = await service.reserveNicknameOrder('test', 'platega');
    await service.settleNicknamePayment(
      testOrder.id,
      'provider-test',
      'succeeded',
      true,
    );
    assert.equal(service.hasNicknameStudio(await user('test')), false);
    const ownerBefore = await user(owner);
    assert.equal(service.hasNicknameStudio(ownerBefore), true);
    assert.equal(
      (await user(artyom)).nickname_style,
      null,
      'gold defaults remain intact',
    );
    await assert.rejects(
      engine.query(
        "UPDATE users SET nickname_style=$1::jsonb WHERE id='other'",
        [JSON.stringify({ color: 'legend', effect: 'shimmer', motion: true })],
      ),
    );
  } finally {
    await engine.close();
    delete globalThis.nickDb;
  }
});

void test('purchase endpoint scopes orders, enforces origin; verified billing rejects underpayment and never grants Plus', async () => {
  const engine = new PGlite({ extensions: { pg_trgm } });
  globalThis.nickDb = client(engine);
  const oldFetch = globalThis.fetch;
  try {
    for (const file of (await readdir('migrations/postgres'))
      .filter((n) => n.endsWith('.sql'))
      .sort())
      await engine.exec(await readFile('migrations/postgres/' + file, 'utf8'));
    await engine.exec(
      "INSERT INTO users(id,identity,nick,created_at) VALUES ('buyer','vk:buyer','Buyer',1),('victim','vk:victim','Victim',1)",
    );
    const order = await service.reserveNicknameOrder('buyer', 'platega');
    await engine.query('UPDATE orders SET provider_id=$1 WHERE id=$2', [
      'provider-payment-123',
      order.id,
    ]);
    const remote = {
      id: 'provider-payment-123',
      payload: order.id,
      paymentDetails: { amount: 4999, currency: 'RUB' },
      status: 'CONFIRMED',
    };
    globalThis.fetch = async () => Response.json(remote);
    const billingCore = url(
      `export const db=()=>globalThis.nickDb;export const now=()=>1800000000000;export const runtime=()=>({PLATEGA_MERCHANT_ID:'mock',PLATEGA_SECRET_KEY:'mock'});export class ApiError extends Error {constructor(message,status=400){super(message);this.status=status;}}`,
    );
    const gateway = url(
      'export const paymentProvider=()=>"platega",paymentsReady=()=>true;export const casheraFetch=async()=>{};export const casheraMatches=()=>false;export const createCasheraCheckout=async()=>{};',
    );
    const billingUrl = await load('lib/server/billing.ts', {
      './core': billingCore,
      './nickname': serviceUrl,
      './payment-gateway': gateway,
      './supporters': url('export const refreshSupporterChampion=async()=>{};'),
      './founders': url(
        'export const assignFounder=()=>{throw Error("must not grant founder")};export const syncFounderRewards=()=>{};',
      ),
      './battlepass-payment': url(
        'export const confirmPassPayment=()=>{};export const revokePassPayment=()=>{};',
      ),
      './vpn': url(
        'export const confirmBundlePayment=()=>{};export const confirmVpnPayment=()=>{};export const revokeBundlePayment=()=>{};export const revokeVpnPayment=()=>{};',
      ),
    });
    const billing = await import(billingUrl);
    await assert.rejects(billing.verifyPayment('provider-payment-123'), {
      status: 400,
    });
    remote.paymentDetails = { amount: 5000, currency: 'USD' };
    await assert.rejects(billing.verifyPayment('provider-payment-123'), {
      status: 400,
    });
    remote.paymentDetails = { amount: 5000, currency: 'RUB' };
    remote.payload = 'wrong-order';
    await assert.rejects(billing.verifyPayment('provider-payment-123'), {
      status: 400,
    });
    remote.payload = order.id;
    assert.equal(
      await billing.verifyPayment('provider-payment-123'),
      'succeeded',
    );
    assert.equal(
      (await engine.query('SELECT COUNT(*)::int n FROM grants')).rows[0].n,
      0,
    );
    const endpointCore =
      url(`export const db=()=>globalThis.nickDb;export const runtime=()=>({});export class ApiError extends Error{constructor(m,status=400){super(m);this.status=status;}}
   export const json=v=>Response.json(v),body=r=>r.json(),fail=e=>Response.json({error:e.message},{status:e.status||500});
   export const sameOrigin=r=>{if(r.headers.get('origin')!=='https://test.local')throw new ApiError('origin',403)};
   export const requireUser=async r=>{if(!r.headers.get('x-user'))throw new ApiError('login',401);return {id:r.headers.get('x-user'),identity:'vk:buyer'}};`);
    const route = await import(
      await load('app/api/nickname/purchase/route.ts', {
        '@/lib/server/core': endpointCore,
        '@/lib/server/payment-gateway': gateway,
        '@/lib/server/billing': billingUrl,
        '@/lib/server/nickname': serviceUrl,
        '@/lib/nickname-styles': sharedUrl,
      })
    );
    const request = (user, action = 'check', origin = 'https://test.local') =>
      new Request('https://test.local/api/nickname/purchase', {
        method: 'POST',
        headers: { origin, ...(user ? { 'x-user': user } : {}) },
        body: JSON.stringify({ action, user_id: 'buyer', amount: 1 }),
      });
    assert.equal((await route.POST(request(null))).status, 401);
    assert.equal(
      (await route.POST(request('buyer', 'check', 'https://evil.local')))
        .status,
      403,
    );
    assert.equal(
      (await (await route.POST(request('victim'))).json()).status,
      'not_found',
      'cannot check another account using supplied ID',
    );
    assert.equal(
      (await (await route.POST(request('buyer'))).json()).status,
      'succeeded',
    );
    assert.equal(
      (await route.POST(request('buyer', 'buy'))).status,
      409,
      'cannot buy an unlocked product',
    );
  } finally {
    globalThis.fetch = oldFetch;
    await engine.close();
    delete globalThis.nickDb;
  }
});
