import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
const url = (source) =>
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
async function load(path, replacements = {}) {
  let source = stripTypeScriptTypes(await readFile(path, 'utf8'));
  for (const [from, to] of Object.entries(replacements))
    source = source.replaceAll(`'${from}'`, JSON.stringify(to));
  return url(source);
}
const sharedUrl = await load('lib/player-catalog-funding.ts'),
  { playerCatalogProgress } = await import(sharedUrl);
void test('1500-ruble rounds reset exactly and carry every kopeck across multiple rounds', () => {
  for (const [total, rounds, current] of [
    [0, 0, 0],
    [149999, 0, 149999],
    [150000, 1, 0],
    [170025, 1, 20025],
    [300000, 2, 0],
    [451001, 3, 1001],
  ]) {
    const p = playerCatalogProgress(total);
    assert.equal(p.currentCents, current);
    assert.equal(p.completedRounds, rounds);
    assert.equal(p.fundedTitles, rounds * 200);
    assert.equal(p.targetCents, 150000);
    assert.ok(p.percent >= 0 && p.percent < 100);
    assert.equal(p.currentCents + p.completedRounds * p.targetCents, total);
  }
  for (const invalid of [-1, NaN, Infinity, 2.1, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => playerCatalogProgress(invalid));
});
void test('campaign counts only new real confirmed player donations and reverses refunded money without changing orders', async () => {
  const engine = new PGlite({ extensions: { pg_trgm } });
  const adapter = {
    prepare(source) {
      let n = 0,
        values = [];
      const sql = source.replace(/\?/g, () => '$' + ++n);
      return {
        bind(...v) {
          values = v;
          return this;
        },
        async first() {
          return (await engine.query(sql, values)).rows[0] || null;
        },
      };
    },
  };
  globalThis.catalogFundingDb = adapter;
  globalThis.catalogPaymentsReady = true;
  const coreUrl = url(
    `export const db=()=>globalThis.catalogFundingDb;export class ApiError extends Error{constructor(message,status=400){super(message);this.status=status}};export const json=value=>Response.json(value,{headers:{'Cache-Control':'no-store'}});export const fail=e=>Response.json({error:e.message},{status:e.status||500});`,
  );
  const serviceUrl = await load('lib/server/player-catalog-funding.ts', {
    './core': coreUrl,
    '../player-catalog-funding': sharedUrl,
  });
  const { playerCatalogFunding } = await import(serviceUrl);
  const { GET } = await import(
    await load('app/api/player-demo/funding/route.ts', {
      '@/lib/server/core': coreUrl,
      '@/lib/server/player-catalog-funding': serviceUrl,
      '@/lib/server/payment-gateway': url(
        'export const paymentsReady=()=>globalThis.catalogPaymentsReady',
      ),
    })
  );
  try {
    for (const migration of (await readdir('migrations/postgres'))
      .filter((name) => name.endsWith('.sql'))
      .sort())
      await engine.exec(
        await readFile('migrations/postgres/' + migration, 'utf8'),
      );
    assert.ok((await playerCatalogFunding()).startsAt > 0);
    await engine.exec(
      "UPDATE player_catalog_campaign SET starts_at=10000; INSERT INTO users(id,identity,nick,created_at) VALUES ('donor','email:donor','Donor',1);",
    );
    const add = async (id, amount, options = {}) => {
      await engine.query(
        'INSERT INTO orders(id,user_id,created_at,plan,amount,duration_days,status,is_test,confirmed_at,fundraising_goal_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [
          id,
          'donor',
          options.createdAt ?? 1,
          options.plan ?? 'donation',
          amount,
          options.plan ? 30 : 0,
          options.status ?? 'succeeded',
          options.test ?? false,
          options.confirmedAt === undefined ? 10000 : options.confirmedAt,
          options.goal ?? 'player',
        ],
      );
    };
    await add('old', 3000, { confirmedAt: 9999 });
    await add('other-goal', 3000, { goal: 'development' });
    await add('plus', 3000, { plan: 'monthly' });
    await add('test', 3000, { test: true });
    await add('pending', 3000, { status: 'pending', confirmedAt: null });
    await add('canceled', 3000, { status: 'canceled' });
    await add('chargeback', 3000, { status: 'chargebacked' });
    await add('unconfirmed', 3000, { confirmedAt: null });
    const owned = async () =>
      (
        await engine.query(
          "SELECT * FROM user_cosmetics WHERE user_id='donor' AND cosmetic_id='tag:player-catalog-patron'",
        )
      ).rows;
    assert.equal(
      (await owned()).length,
      0,
      'excluded payments never award the tag',
    );
    await engine.exec("UPDATE users SET tag='legend-origin' WHERE id='donor';");
    assert.equal(
      (await playerCatalogFunding()).totalCents,
      0,
      'historical, subscriptions, foreign goal, tests and unconfirmed funds are excluded',
    );
    await add('live', 1500);
    let p = await playerCatalogFunding();
    assert.equal(p.currentCents, 0);
    assert.equal(p.fundedTitles, 200);
    assert.equal((await owned()).length, 1);
    assert.equal(
      (await engine.query("SELECT tag FROM users WHERE id='donor'")).rows[0]
        .tag,
      'legend-origin',
      'existing honorary appearance is not replaced',
    );
    await add('carry', 200.25);
    p = await playerCatalogFunding();
    assert.equal(p.currentCents, 20025);
    assert.equal(p.completedRounds, 1);
    await engine.exec("UPDATE orders SET status='succeeded' WHERE id='live';");
    assert.equal(
      (await playerCatalogFunding()).totalCents,
      170025,
      'duplicate confirmation cannot double-count',
    );
    assert.equal(
      (await owned()).length,
      1,
      'repeat donations and webhook retries keep one permanent inventory item',
    );
    await assert.rejects(
      engine.query(
        "INSERT INTO user_cosmetics(user_id,cosmetic_id,unlocked_at,source,source_key,metadata) VALUES ('donor','tag:player-catalog-patron',1,'admin','fake','{}')",
      ),
      /Patron tag requires/,
    );
    await engine.exec(
      "UPDATE orders SET status='chargebacked' WHERE id='live';",
    );
    p = await playerCatalogFunding();
    assert.equal(p.totalCents, 20025);
    assert.equal(p.completedRounds, 0);
    assert.equal(
      (await owned()).length,
      1,
      'another valid donation preserves the reward after one chargeback',
    );
    await engine.exec(
      "UPDATE users SET tag='player-catalog-patron' WHERE id='donor'; UPDATE orders SET status='chargebacked' WHERE id='carry';",
    );
    assert.equal(
      (await owned()).length,
      0,
      'a fully refunded contribution cannot retain the donor reward',
    );
    assert.equal(
      (await engine.query("SELECT tag FROM users WHERE id='donor'")).rows[0]
        .tag,
      null,
    );
    await add('replacement', 150);
    assert.equal(
      (await owned()).length,
      1,
      'minimum accepted donation awards the same tag',
    );
    await engine.exec(
      "INSERT INTO users(id,identity,nick,created_at) VALUES ('preview','preview:test','Preview',1); INSERT INTO orders(id,user_id,created_at,plan,amount,duration_days,status,is_test,confirmed_at) VALUES ('preview-order','preview',1,'donation',150,0,'succeeded',false,10000);",
    );
    assert.equal(
      (
        await engine.query(
          "SELECT count(*)::int AS n FROM user_cosmetics WHERE user_id='preview' AND cosmetic_id='tag:player-catalog-patron'",
        )
      ).rows[0].n,
      0,
    );
    assert.equal((await playerCatalogFunding()).totalCents,15000,'preview accounts cannot inflate the public campaign');
    const response = await GET();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.json()).acceptingDonations, true);
    globalThis.catalogPaymentsReady = false;
    assert.equal((await (await GET()).json()).acceptingDonations, false);
    globalThis.catalogPaymentsReady = true;
    await engine.exec(
      "UPDATE fundraising_goals SET is_active=false WHERE slug='player';",
    );
    assert.equal((await (await GET()).json()).acceptingDonations, false);
    assert.equal(
      Number(
        (
          await engine.query(
            "SELECT target_amount FROM fundraising_goals WHERE slug='player'",
          )
        ).rows[0].target_amount,
      ),
      60000,
    );
    assert.equal(
      (await engine.query('SELECT count(*)::int AS n FROM grants')).rows[0].n,
      0,
      'progress calculation never grants purchases or simulates title imports',
    );
    await engine.exec('DELETE FROM player_catalog_campaign');
    assert.equal((await GET()).status, 503);
  } finally {
    await engine.close();
    delete globalThis.catalogFundingDb;
    delete globalThis.catalogPaymentsReady;
  }
});
