import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';

const url = (source) =>
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
async function load(path, replacements = {}) {
  let source = stripTypeScriptTypes(await readFile(path, 'utf8'));
  for (const [from, to] of Object.entries(replacements))
    source = source.replaceAll(`'${from}'`, JSON.stringify(to));
  return import(url(source));
}
function database(engine) {
  return {
    prepare(source) {
      let values = [];
      let index = 0;
      const sql = source.replace(/\?/g, () => '$' + ++index);
      const execute = (connection) => connection.query(sql, values);
      return {
        bind(...params) {
          values = params;
          return this;
        },
        async first() {
          return (await execute(engine)).rows[0] ?? null;
        },
        async all() {
          return { results: (await execute(engine)).rows };
        },
        async run() {
          return execute(engine);
        },
        execute,
      };
    },
    async batch(statements) {
      return engine.transaction(async (tx) => {
        for (const statement of statements) await statement.execute(tx);
      });
    },
  };
}

test('fundraising migration, checkout, provider verification and permanent inventories', async (t) => {
  const engine = new PGlite({ extensions: { pg_trgm } });
  const originalFetch = globalThis.fetch;
  globalThis.fundraisingTestDb = database(engine);
  const config = {
    PAYMENTS_ENABLED: 'true',
    PLATEGA_MERCHANT_ID: 'test-merchant',
    PLATEGA_SECRET_KEY: 'test-secret',
    SITE_URL: 'https://example.test',
  };
  globalThis.fundraisingTestRuntime = config;
  const coreUrl = url(`
    export const db = () => globalThis.fundraisingTestDb;
    export const runtime = () => globalThis.fundraisingTestRuntime;
    export const now = () => Date.now();
    export const uid = () => crypto.randomUUID();
    export class ApiError extends Error { constructor(message,status=400,code='request_failed') { super(message); this.status=status; this.code=code; } }
    export const json = (value,status=200) => Response.json(value,{status});
    export const fail = (error) => json({error:error.message,code:error.code},error.status || 500);
    export const body = (request) => request.json();
    export const sameOrigin = (request) => { if(request.headers.get('origin')!=='https://example.test') throw new ApiError('origin',403); };
    export async function viewer(request) { return db().prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires>?').bind(request.headers.get('cookie') || '',now()).first(); }
    export async function requireUser(request) { const user=await viewer(request); if(!user) throw new ApiError('login',401); return user; }
    export async function premium(id) { const row=await db().prepare('SELECT MAX(expires) AS expires FROM grants WHERE user_id=? AND revoked_at IS NULL').bind(id).first(); return row?.expires>now()?row.expires:0; }
  `);
  const fundraiserUrl = url(
    stripTypeScriptTypes(
      await readFile('lib/server/fundraising.ts', 'utf8'),
    ).replace("'./core'", JSON.stringify(coreUrl)),
  );
  const plansUrl = url(
    stripTypeScriptTypes(await readFile('lib/subscription-plans.ts', 'utf8')),
  );
  const sharedUrl = url(
    stripTypeScriptTypes(await readFile('lib/fundraising.ts', 'utf8')),
  );
  const supportersUrl = url(
    'export const refreshSupporterChampion = async () => {};',
  );
  const foundersUrl = url(
    'export const assignFounder = async () => {}; export const syncFounderRewards = async () => {};',
  );
  const billingSource = stripTypeScriptTypes(
    await readFile('lib/server/billing.ts', 'utf8'),
  )
    .replace("'./core'", JSON.stringify(coreUrl))
    .replace("'./supporters'", JSON.stringify(supportersUrl))
    .replace("'./founders'", JSON.stringify(foundersUrl))
    .replace("'./vpn'", JSON.stringify(url(
      'export const confirmVpnPayment=async()=>{}; export const revokeVpnPayment=async()=>{}; export const confirmBundlePayment=async()=>{}; export const revokeBundlePayment=async()=>{};',
    )));
  const billingUrl = url(billingSource);
  const billing = await import(billingUrl);
  const fundraising = await import(fundraiserUrl);
  const cosmetics = await load('lib/server/cosmetics.ts', {
    './core': coreUrl,
  });
  const checkout = await load('app/api/payments/route.ts', {
    '@/lib/server/core': coreUrl,
    '@/lib/server/billing': billingUrl,
    '@/lib/server/fundraising': fundraiserUrl,
    '@/lib/subscription-plans': plansUrl,
    '@/lib/fundraising': sharedUrl,
    '@/lib/vpn-plan': url("export const VPN_PLAN={id:'vpn',days:30,price:'149.00'}; export const VPN_PLUS_PLAN={id:'vpn_plus',days:30,price:'199.00'};"),
    '@/lib/server/vpn': url('export const vpnPurchaseAvailable=()=>false; export const vpnBundlePurchaseAvailable=()=>false;'),
  });
  const cosmeticUrl = url(
    stripTypeScriptTypes(
      await readFile('lib/server/cosmetics.ts', 'utf8'),
    ).replace("'./core'", JSON.stringify(coreUrl)),
  );
  const equipSource = stripTypeScriptTypes(
    await readFile('app/api/cosmetics/route.ts', 'utf8'),
  )
    .replaceAll("'@/lib/server/core'", JSON.stringify(coreUrl))
    .replace("'@/lib/server/cosmetics'", JSON.stringify(cosmeticUrl));
  const equip = await import(url(equipSource));
  const webhook = await load('app/api/payments/webhook/route.ts', {
    '@/lib/server/core': coreUrl,
    '@/lib/server/billing': billingUrl,
  });
  const transactions = new Map();
  globalThis.fetch = async (address, init = {}) => {
    assert.ok(String(address).startsWith('https://app.platega.io/'));
    if (init.method === 'POST') {
      const input = JSON.parse(init.body);
      const id = crypto.randomUUID();
      transactions.set(id, {
        id,
        status: 'PENDING',
        payload: input.payload,
        paymentDetails: input.paymentDetails,
      });
      return Response.json({
        transactionId: id,
        redirect: 'https://provider.test/pay/' + id,
      });
    }
    const id = String(address).split('/').at(-1);
    assert.ok(transactions.has(id));
    return Response.json(transactions.get(id));
  };
  const request = (input, session = 'dev-session') =>
    new Request('https://example.test/api/payments', {
      method: 'POST',
      headers: {
        origin: 'https://example.test',
        cookie: session,
        'content-type': 'application/json',
      },
      body: JSON.stringify(input),
    });
  const query = async (sql, values = []) =>
    (await engine.query(sql, values)).rows;
  const inventory = (id) =>
    query(
      "SELECT cosmetic_id FROM user_cosmetics WHERE user_id=$1 AND source='fundraising' ORDER BY cosmetic_id",
      [id],
    );
  async function create(
    goalSlug,
    amount = 150,
    plan = 'donation',
    session = 'dev-session',
  ) {
    const response = await checkout.POST(
      request(
        { action: 'create', plan, goalSlug, amount, userId: 'attacker' },
        session,
      ),
    );
    assert.equal(
      response.status,
      200,
      JSON.stringify(await response.clone().json()),
    );
    const result = await response.json();
    return result.url.split('/').at(-1);
  }
  async function confirm(id, status = 'CONFIRMED', isTest = false) {
    Object.assign(transactions.get(id), { status, isTest });
    return billing.verifyPayment(id);
  }

  try {
    const migrations = (await readdir('migrations/postgres'))
      .filter((name) => name.endsWith('.sql'))
      .sort();
    for (const name of migrations.filter((name) => name < '0037'))
      await engine.exec(await readFile('migrations/postgres/' + name, 'utf8'));
    await engine.exec(`INSERT INTO users(id,identity,nick,created_at) VALUES
      ('legacy','email:legacy','Legacy',1),('dev','email:dev','Dev',1),('player','email:player','Player',1),
      ('attacker','email:attacker','Attacker',1),('plus','email:plus','Plus',1),('broken','email:broken','Broken',1);
      INSERT INTO sessions(hash,user_id,expires) VALUES ('dev-session','dev',253402300799000),('player-session','player',253402300799000),
        ('plus-session','plus',253402300799000),('broken-session','broken',253402300799000);
      INSERT INTO orders(id,user_id,created_at,plan,amount,status,is_test) VALUES
        ('old-paid','legacy',1,'support',250,'succeeded',false),('old-pending','legacy',2,'support',110,'pending',false),
        ('old-failed','legacy',3,'support',500,'failed',false),('old-canceled','legacy',4,'support',900,'canceled',false),
        ('old-test','legacy',5,'support',1000,'succeeded',true);`);
    const before = (
      await query(
        "SELECT SUM(amount) AS amount FROM orders WHERE status='succeeded' AND NOT is_test",
      )
    )[0].amount;
    await engine.exec(
      await readFile('migrations/postgres/0037_fundraising_goals.sql', 'utf8'),
    );
    await engine.exec(await readFile('migrations/postgres/0039_support_asset_update.sql', 'utf8'));

    await t.test(
      'migration preserves historical totals, assigns player and grants pink set without equipping',
      async () => {
        const goals = await fundraising.fundraisingGoals('legacy');
        const player = goals.find((g) => g.slug === 'player');
        assert.equal(player.raised, Number(before));
        assert.equal(player.targetAmount, 60000);
        assert.equal(player.bundleOwned, true);
        assert.equal(goals.find((g) => g.slug === 'development').raised, 0);
        assert.equal(
          goals.find((g) => g.slug === 'development').targetAmount,
          20000,
        );
        assert.ok(
          (await query('SELECT fundraising_goal_id FROM orders')).every(
            (o) => o.fundraising_goal_id === 'player',
          ),
        );
        assert.equal((await inventory('legacy')).length, 5);
        assert.ok(
          (await inventory('legacy')).some(
            (i) => i.cosmetic_id === 'pin:player-supporter',
          ),
        );
        assert.equal(
          (
            await query(
              "SELECT pin,tag,profile_frame,profile_background FROM users WHERE id='legacy'",
            )
          )[0].pin,
          null,
        );
      },
    );

    await t.test(
      'checkout validates active goal, amount, and authenticated user; pending has no rewards',
      async () => {
        for (const goalSlug of ['missing', "player' OR true--"])
          assert.equal(
            (
              await checkout.POST(
                request({ plan: 'donation', amount: 150, goalSlug }),
              )
            ).status,
            400,
          );
        for (const amount of [0, 1, 100, 149, -1, 150.5, null, true, 100001])
          assert.equal(
            (
              await checkout.POST(
                request({ plan: 'donation', amount, goalSlug: 'development' }),
              )
            ).status,
            400,
          );
        assert.equal(
          (
            await checkout.POST(
              request(
                {
                  plan: 'donation',
                  amount: 150,
                  goalSlug: 'development',
                  userId: 'dev',
                },
                '',
              ),
            )
          ).status,
          401,
        );
        await engine.exec(
          "UPDATE fundraising_goals SET is_active=false WHERE slug='development'",
        );
        assert.equal(
          (
            await checkout.POST(
              request({ plan: 'donation', amount: 150, goalSlug: 'development' }),
            )
          ).status,
          400,
        );
        await engine.exec(
          "UPDATE fundraising_goals SET is_active=true WHERE slug='development'",
        );
        const id = await create('development');
        assert.equal(
          (
            await query(
              'SELECT user_id,fundraising_goal_id FROM orders WHERE provider_id=$1',
              [id],
            )
          )[0].user_id,
          'dev',
        );
        assert.equal(await billing.verifyPayment(id), 'pending');
        assert.equal((await inventory('dev')).length, 0);
        assert.equal(
          (await fundraising.fundraisingGoals()).find(
            (g) => g.slug === 'development',
          ).raised,
          0,
        );
        await confirm(id, 'CANCELED');
        assert.equal((await inventory('dev')).length, 0);
        const failed = await create('development');
        assert.equal(await confirm(failed, 'FAILED'), 'pending');
        assert.equal((await inventory('dev')).length, 0);
        const testId = await create('development');
        await confirm(testId, 'CONFIRMED', true);
        assert.equal((await inventory('dev')).length, 0);
      },
    );

    await t.test(
      '150 ruble development grants four items; repeated payments and webhooks cannot duplicate',
      async () => {
        const id = await create('development');
        const beforeEquip = (
          await query(
            "SELECT pin,tag,profile_frame,profile_background FROM users WHERE id='dev'",
          )
        )[0];
        await confirm(id);
        assert.equal((await inventory('dev')).length, 4);
        assert.ok(
          (await inventory('dev')).some(
            (i) => i.cosmetic_id === 'pin:development-supporter',
          ),
        );
        assert.ok(
          !(await inventory('dev')).some(
            (i) => i.cosmetic_id === 'pin:player-supporter',
          ),
        );
        const callback = () =>
          new Request('https://example.test/api/payments/webhook', {
            method: 'POST',
            headers: {
              'x-merchantid': config.PLATEGA_MERCHANT_ID,
              'x-secret': config.PLATEGA_SECRET_KEY,
            },
            body: JSON.stringify({ id, status: 'CONFIRMED' }),
          });
        assert.equal(
          (
            await webhook.POST(
              new Request('https://example.test/api/payments/webhook', {
                method: 'POST',
                body: '{}',
              }),
            )
          ).status,
          401,
        );
        for (const response of await Promise.all([
          webhook.POST(callback()),
          webhook.POST(callback()),
        ]))
          assert.equal(response.status, 200);
        const repeat = await create('development', 300);
        await Promise.all([confirm(repeat), billing.verifyPayment(repeat)]);
        assert.equal((await inventory('dev')).length, 4);
        assert.equal(
          (
            await query(
              "SELECT * FROM fundraising_reward_grants WHERE user_id='dev'",
            )
          ).length,
          1,
        );
        const goals = await fundraising.fundraisingGoals('dev');
        assert.equal(goals.find((g) => g.slug === 'development').raised, 450);
        assert.equal(goals.find((g) => g.slug === 'player').raised, 250);
        assert.equal(
          (await query("SELECT * FROM grants WHERE user_id='dev'")).length,
          0,
        );
        assert.deepEqual(
          (
            await query(
              "SELECT pin,tag,profile_frame,profile_background FROM users WHERE id='dev'",
            )
          )[0],
          beforeEquip,
        );
      },
    );

    await t.test(
      'player increments only player and grants pink set; supporting both owns each shared item once',
      async () => {
        const id = await create('player', 150, 'donation', 'player-session');
        await confirm(id);
        const owned = await inventory('player');
        assert.equal(owned.length, 4);
        assert.ok(owned.some((i) => i.cosmetic_id === 'pin:player-supporter'));
        assert.ok(
          !owned.some((i) => i.cosmetic_id === 'pin:development-supporter'),
        );
        const both = await create('player', 150);
        await confirm(both);
        assert.equal((await inventory('dev')).length, 6);
        assert.equal(
          (
            await query(
              "SELECT * FROM fundraising_reward_grants WHERE user_id='dev'",
            )
          ).length,
          2,
        );
        const goals = await fundraising.fundraisingGoals();
        assert.equal(goals.find((g) => g.slug === 'player').raised, 550);
        assert.equal(goals.find((g) => g.slug === 'development').raised, 450);
      },
    );

    await t.test(
      'Plus routed to development still extends once and grants its set',
      async () => {
        const id = await create('development', 0, 'monthly', 'plus-session');
        await confirm(id);
        const first = (
          await query("SELECT expires FROM grants WHERE user_id='plus'")
        )[0].expires;
        await confirm(id);
        assert.equal(
          (await query("SELECT expires FROM grants WHERE user_id='plus'"))[0]
            .expires,
          first,
        );
        assert.equal((await inventory('plus')).length, 4);
        const second = await create('player', 0, 'annual', 'plus-session');
        await confirm(second);
        const latest = (
          await query(
            "SELECT MAX(expires) AS expires FROM grants WHERE user_id='plus'",
          )
        )[0].expires;
        assert.equal(latest - first, 365 * 86400000);
        assert.equal(
          (
            await query(
              "SELECT * FROM user_cosmetics WHERE user_id='plus' AND cosmetic_id='tag:eternal-nakama'",
            )
          ).length,
          1,
        );
      },
    );

    await t.test(
      'all items can be equipped and removed after logout/login and goal closure without Plus',
      async () => {
        await engine.exec(
          "UPDATE fundraising_goals SET is_active=false WHERE slug='development'",
        );
        await engine.exec("DELETE FROM sessions WHERE hash='dev-session'");
        assert.equal(
          (
            await equip.GET(
              new Request('https://example.test/api/cosmetics', {
                headers: { cookie: 'dev-session' },
              }),
            )
          ).status,
          401,
        );
        await engine.exec(
          "INSERT INTO sessions(hash,user_id,expires) VALUES ('dev-session','dev',253402300799000)",
        );
        const catalog = await (
          await equip.GET(
            new Request('https://example.test/api/cosmetics', {
              headers: { cookie: 'dev-session' },
            }),
          )
        ).json();
        const items = catalog.cosmetics.filter(
          (c) => c.source === 'fundraising',
        );
        assert.equal(items.filter((c) => c.unlocked).length, 6);
        for (const [kind, slug, column, expected] of [
          ['pin', 'development-supporter', 'pin', 'development-supporter'],
          ['tag', 'support-oni-vip', 'tag', 'support-oni-vip'],
          ['tag', 'support-oni-player', 'tag', 'support-oni-player'],
          ['frame', 'support-oni', 'profile_frame', 'support-oni'],
          [
            'background',
            'support-oni-background',
            'profile_background',
            '/rewards/support/background.png',
          ],
        ]) {
          assert.equal((await equip.POST(request({ kind, slug }))).status, 200);
          assert.equal(
            (
              await query(`SELECT ${column} AS value FROM users WHERE id='dev'`)
            )[0].value,
            expected,
          );
          if (kind === 'background')
            assert.equal(
              await cosmetics.safeProfileBackground('dev', expected, 0),
              expected,
            );
          assert.equal(
            (await equip.POST(request({ kind, slug: null }))).status,
            200,
          );
          assert.equal(
            (
              await query(`SELECT ${column} AS value FROM users WHERE id='dev'`)
            )[0].value,
            kind === 'frame' ? 'none' : null,
          );
        }
        assert.equal((await inventory('dev')).length, 6);
        assert.equal(
          await cosmetics.safeProfileBackground(
            'attacker',
            '/rewards/support/background.png',
            0,
          ),
          null,
        );
        await assert.rejects(() =>
          cosmetics.validateEquippedCosmetic(
            'attacker',
            'pin',
            'development-supporter',
          ),
        );
        assert.equal(
          (
            await equip.POST(
              request(
                { kind: 'pin', slug: 'development-supporter' },
                'player-session',
              ),
            )
          ).status,
          403,
        );
        await engine.exec(
          "UPDATE fundraising_goals SET is_active=true WHERE slug='development'",
        );
      },
    );

    await t.test(
      'failure granting one item rolls back confirmation, inventory and bundle marker; retry succeeds',
      async () => {
        const id = await create('development', 0, 'monthly', 'broken-session');
        await engine.exec(`CREATE FUNCTION fail_reward_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.user_id='broken' AND NEW.cosmetic_id='frame:support-oni' THEN RAISE EXCEPTION 'simulated inventory failure'; END IF;
        RETURN NEW; END $$;
        CREATE TRIGGER fail_reward_test BEFORE INSERT ON user_cosmetics FOR EACH ROW EXECUTE FUNCTION fail_reward_test();`);
        await assert.rejects(() => confirm(id), /simulated inventory failure/);
        assert.equal(
          (
            await query('SELECT status FROM orders WHERE provider_id=$1', [id])
          )[0].status,
          'pending',
        );
        assert.equal((await inventory('broken')).length, 0);
        assert.equal(
          (
            await query(
              "SELECT * FROM fundraising_reward_grants WHERE user_id='broken'",
            )
          ).length,
          0,
        );
        assert.equal(
          (await query("SELECT * FROM grants WHERE user_id='broken'")).length,
          0,
        );
        await engine.exec(
          'DROP TRIGGER fail_reward_test ON user_cosmetics; DROP FUNCTION fail_reward_test();',
        );
        await engine.exec(
          "UPDATE fundraising_goals SET is_active=false WHERE slug='development'",
        );
        await confirm(id);
        assert.equal((await inventory('broken')).length, 4);
        // Closed goals honour payments already created while active.
        await engine.exec(
          "UPDATE fundraising_goals SET is_active=true WHERE slug='development'",
        );
      },
    );

    await t.test(
      'database prevents direct unconfirmed ownership and mismatched provider confirmation',
      async () => {
        await assert.rejects(
          () =>
            engine.exec(
              "INSERT INTO user_cosmetics(user_id,cosmetic_id,unlocked_at,source) VALUES ('attacker','pin:development-supporter',1,'admin')",
            ),
          /confirmed payment/,
        );
        const id = await create('development', 150);
        transactions.get(id).paymentDetails.amount = 1;
        await assert.rejects(() => confirm(id), /Платёж не подтверждён/);
        assert.equal(
          (
            await query('SELECT status FROM orders WHERE provider_id=$1', [id])
          )[0].status,
          'pending',
        );
      },
    );
    await t.test(
      'explicit administrative collection grants are permanent and cannot grant to ordinary accounts',
      async () => {
        await engine.exec(
          await readFile(
            'migrations/postgres/0038_admin_cosmetic_inventory.sql',
            'utf8',
          ),
        );
        await engine.exec(
          "INSERT INTO users(id,identity,nick,role,created_at) VALUES ('admin-owner','test:admin-owner','AdminOwner','admin',1)",
        );
        const beforeTotals = (await fundraising.fundraisingGoals()).map((g) => [
          g.slug,
          g.raised,
        ]);
        for (const cosmetic of [
          'pin:founder-001',
          'pin:development-supporter',
        ]) {
          await assert.rejects(() =>
            engine.query(
              `INSERT INTO user_cosmetics(user_id,cosmetic_id,unlocked_at,source,metadata)
          VALUES ('attacker',$1,1,'admin','{"admin_actor_id":"admin-owner"}')`,
              [cosmetic],
            ),
          );
          await assert.rejects(() =>
            engine.query(
              `INSERT INTO user_cosmetics(user_id,cosmetic_id,unlocked_at,source,metadata)
          VALUES ('admin-owner',$1,1,'admin','{"admin_actor_id":"attacker"}')`,
              [cosmetic],
            ),
          );
        }
        for (let repeat = 0; repeat < 2; repeat++)
          await engine.exec(`INSERT INTO user_cosmetics(user_id,cosmetic_id,unlocked_at,source,source_key,metadata)
        SELECT 'admin-owner',id,1,'admin','admin-all:' || id,'{"admin_actor_id":"admin-owner"}' FROM cosmetics WHERE active=1
        ON CONFLICT(user_id,cosmetic_id) DO NOTHING`);
        const catalog = await cosmetics.cosmeticsCatalog('admin-owner');
        assert.ok(catalog.every((c) => c.unlocked));
        assert.equal(
          (
            await query(
              "SELECT COUNT(*) AS count FROM user_cosmetics WHERE user_id='admin-owner'",
            )
          )[0].count,
          catalog.length,
        );
        for (const item of catalog)
          assert.equal(
            await cosmetics.validateEquippedCosmetic(
              'admin-owner',
              item.kind,
              item.slug,
              0,
            ),
            item.slug,
          );
        assert.equal(
          await cosmetics.safeProfileBackground(
            'admin-owner',
            '/rewards/support/background.png',
            0,
          ),
          '/rewards/support/background.png',
        );
        assert.equal(
          (
            await query(
              "SELECT * FROM founding_members WHERE user_id='admin-owner'",
            )
          ).length,
          0,
        );
        assert.equal(
          (await query("SELECT * FROM orders WHERE user_id='admin-owner'"))
            .length,
          0,
        );
        const goals = await fundraising.fundraisingGoals('admin-owner');
        assert.ok(goals.every((g) => g.bundleOwned));
        assert.deepEqual(
          goals.map((g) => [g.slug, g.raised]),
          beforeTotals,
        );
        await engine.exec(
          "UPDATE users SET role='user' WHERE id='admin-owner'",
        );
        await assert.rejects(() =>
          cosmetics.validateEquippedCosmetic(
            'admin-owner',
            'pin',
            'founder-001',
            0,
          ),
        );
        await assert.rejects(() =>
          cosmetics.validateEquippedCosmetic(
            'admin-owner',
            'pin',
            'one-piece',
            0,
          ),
        );
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.fundraisingTestDb;
    delete globalThis.fundraisingTestRuntime;
    await engine.close();
  }
});

test('original frame and profile background remain unchanged', async () => {
  const paths = [
    [
      'frame.png',
      '5fbd8a761bcf9b12ee2767713cfab5685e1d574bca693e961fe41c7bcb8b9e26',
    ],
    [
      'background.png',
      '102a33d97ebd71f7915ed374f2b5f3cbe33657cb6e71f743639b499eea04e4e0',
    ],
  ];
  // Keep asset verification portable: the canonical digests are checked in;
  // tests never rely on a user's temporary clipboard directory.
  for (const [file, digest] of paths) {
    const data = await readFile('public/rewards/support/' + file);
    assert.ok(data.length > 0);
    assert.equal(data.subarray(1, 4).toString(), 'PNG');
    assert.equal(createHash('sha256').update(data).digest('hex'), digest);
  }
});


test('pin and tag cutouts have actual alpha transparency, including transparent corners', async () => {
  for (const file of ['player-pin-v2.png','development-pin-v2.png','player-tag-v2.png','development-tag-v2.png']) {
    const png=await readFile('public/rewards/support/' + file);
    assert.equal(png[24],8); assert.equal(png[25],6); assert.equal(png[28],0);
    const info={width:png.readUInt32BE(16),height:png.readUInt32BE(20)};
    const chunks=[];
    for(let offset=8;offset<png.length;) { const size=png.readUInt32BE(offset); if(png.toString('ascii',offset+4,offset+8)==='IDAT') chunks.push(png.subarray(offset+8,offset+8+size)); offset+=12+size; }
    const raw=inflateSync(Buffer.concat(chunks)),stride=info.width*4,data=Buffer.alloc(stride*info.height);
    for(let y=0;y<info.height;y++) {
      const filter=raw[y*(stride+1)];
      for(let x=0;x<stride;x++) {
        const a=x>=4?data[y*stride+x-4]:0,b=y?data[(y-1)*stride+x]:0,c=y&&x>=4?data[(y-1)*stride+x-4]:0;
        const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);
        const predictor=filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):pa<=pb&&pa<=pc?a:pb<=pc?b:c;
        data[y*stride+x]=(raw[y*(stride+1)+1+x]+predictor)&255;
      }
    }
    const corners=[0,info.width-1,(info.height-1)*info.width,info.width*info.height-1];
    for (const offset of corners) assert.equal(data[offset*4+3],0, file + ' opaque corner');
    let transparent=0,opaque=0;
    for(let i=3;i<data.length;i+=4) { if(data[i]===0) transparent++; if(data[i]>=240) opaque++; }
    assert.ok(transparent>info.width*info.height*0.1, file + ' must have transparent surroundings');
    assert.ok(opaque>info.width*info.height*0.15, file + ' artwork must remain visible');
  }
});
