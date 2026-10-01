import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';

const source = stripTypeScriptTypes(await readFile('lib/server/founders.ts', 'utf8'))
  .replace("import { db, now } from './core';", 'const db = () => globalThis.founderTestDatabase; const now = () => Date.now();');
const founder = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

function adapter(engine) {
  const make = (connection) => ({
    prepare(source) {
      let values = [];
      let index = 0;
      const query = source.replace(/\?/g, () => '$' + ++index);
      return {
        bind(...args) { values = args; return this; },
        async first() { return (await connection.query(query, values)).rows[0] ?? null; },
        async all() { return { results: (await connection.query(query, values)).rows }; },
        async run() { return connection.query(query, values); },
      };
    },
    async batch(statements) {
      for (const item of statements) await item.run();
    },
    transaction(callback) { return connection.transaction((tx) => callback(make(tx))); },
  });
  return make(engine);
}

test('Founder threshold, permanent seats, rewards, and historical ordering', async () => {
  const engine = new PGlite({ extensions: { pg_trgm } });
  globalThis.founderTestDatabase = adapter(engine);
  try {
    for (const name of (await readdir('migrations/postgres')).filter((name) => name.endsWith('.sql')).sort())
      await engine.exec(await readFile(`migrations/postgres/${name}`, 'utf8'));
    const users = [];
    for (let n = 0; n < 16; n++) {
      const id = randomUUID(); users.push(id);
      await engine.query('INSERT INTO users(id,identity,nick,created_at) VALUES ($1,$2,$3,$4)', [id, `email:${id}`, `founder_test_${n}`, n]);
    }
    let sequence = 0;
    async function order(user, amount, status = 'succeeded', time = ++sequence) {
      const id = randomUUID();
      await engine.query('INSERT INTO orders(id,user_id,provider,plan,amount,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [id, user, 'platega', 'support', amount, status, time]);
      return id;
    }
    for (const value of [999, 500, 500, 300, 500]) {
      const id = await order(users[0], value);
      assert.equal(await founder.assignFounder(id), null);
    }
    const pending = await order(users[0], 1000, 'pending');
    const failed = await order(users[0], 5000, 'failed');
    const testPayment = await order(users[0], 5000);
    await engine.query('UPDATE orders SET is_test=true WHERE id=$1', [testPayment]);
    assert.equal(await founder.assignFounder(pending), null);
    assert.equal(await founder.assignFounder(failed), null);
    assert.equal(await founder.assignFounder(testPayment), null);
    const first = await order(users[0], 1000);
    await engine.query('UPDATE founding_sequence SET backfilled=false');
    assert.equal(await founder.assignFounder(first), null);
    await engine.query('UPDATE founding_sequence SET backfilled=true');
    assert.equal(await founder.assignFounder(first), 1);
    assert.equal(await founder.assignFounder(first), 1);
    assert.equal(await founder.assignFounder(await order(users[0], 1500)), 1);
    const second = await order(users[1], 1500);
    assert.equal(await founder.assignFounder(second), 2);
    for (let n = 2; n < 4; n++)
      assert.equal(await founder.assignFounder(await order(users[n], 1000)), n + 1);
    const simultaneous = await Promise.all([
      order(users[4], 1000), order(users[5], 1500),
    ]);
    const seats = await Promise.all(simultaneous.map((id) => founder.assignFounder(id)));
    assert.deepEqual(seats.sort(), [5, 6]);
    for (let n = 6; n < 10; n++)
      assert.equal(await founder.assignFounder(await order(users[n], 1000)), n + 1);
    assert.equal(await founder.assignFounder(await order(users[10], 5000)), null);
    const members = (await engine.query('SELECT user_id,founder_number,payment_id FROM founding_members ORDER BY founder_number')).rows;
    assert.equal(members.length, 10);
    assert.equal(members[0].payment_id, first);
    assert.equal(members[1].payment_id, second);
    assert.equal(new Set(members.map((row) => row.founder_number)).size, 10);
    await founder.syncFounderRewards(users[0]);
    await founder.syncFounderRewards(users[0]);
    await founder.syncFounderRewards(users[1]);
    await founder.syncFounderRewards(users[2]);
    await founder.syncFounderRewards(users[3]);
    const grants = (await engine.query("SELECT order_id,lifetime,expires FROM grants WHERE order_id LIKE 'founder:%' ORDER BY order_id")).rows;
    assert.equal(grants.length, 4);
    assert.equal(grants[0].lifetime, true);
    assert.equal(grants[1].lifetime, false);
    for (const n of [2, 3, 4]) {
      const joinedAt = (await engine.query('SELECT first_qualifying_payment_at AS at FROM founding_members WHERE founder_number=$1', [n])).rows[0].at;
      const date = new Date(Number(joinedAt));
      date.setUTCMonth(date.getUTCMonth() + (n <= 3 ? 12 : 6));
      assert.equal(Number(grants[n - 1].expires), date.getTime());
    }
    assert.equal((await engine.query("SELECT count(*) AS n FROM user_cosmetics WHERE user_id=$1 AND source='founder'", [users[0]])).rows[0].n, 4);
    await engine.query("UPDATE orders SET status='chargebacked' WHERE id=$1", [first]);
    await founder.syncFounderRewards(users[0]);
    assert.equal((await engine.query('SELECT founder_number FROM founding_members WHERE user_id=$1', [users[0]])).rows[0].founder_number, 1);
    await assert.rejects(() => engine.query("INSERT INTO user_cosmetics(user_id,cosmetic_id,unlocked_at,source) VALUES ($1,'tag:founding-10',0,'achievement')", [users[11]]));
    await assert.rejects(() => engine.query("INSERT INTO user_cosmetics(user_id,cosmetic_id,unlocked_at,source) VALUES ($1,'pin:founder-010',0,'founder')", [users[0]]));
    assert.equal(founder.qualifiesForFounder('succeeded', 'RUB', 999), false);
    assert.equal(founder.qualifiesForFounder('succeeded', 'RUB', 1000), true);
    assert.equal(founder.qualifiesForFounder('pending', 'RUB', 1000), false);
    assert.equal(founder.qualifiesForFounder('failed', 'RUB', 5000), false);
    assert.equal(founder.qualifiesForFounder('succeeded', 'USD', 5000), false);
    const published = await founder.publicFounders();
    assert.equal(published.remaining, 0);
    assert.equal(published.founders.length, 10);
    assert.equal('payment_id' in published.founders[0], false);
    assert.equal('id' in published.founders[0], false);
  } finally {
    delete globalThis.founderTestDatabase;
    await engine.close();
  }
});

test('backfill preview selects the first qualifying payment per unique user and can be replayed', async () => {
  const engine = new PGlite({ extensions: { pg_trgm } });
  try {
    for (const name of (await readdir('migrations/postgres')).filter((name) => name.endsWith('.sql')).sort())
      await engine.exec(await readFile(`migrations/postgres/${name}`, 'utf8'));
    const users = [];
    for (let n = 0; n < 12; n++) {
      const id = randomUUID(); users.push(id);
      await engine.query('INSERT INTO users(id,identity,nick,created_at) VALUES ($1,$2,$3,0)', [id, `email:${id}`, `backfill_${n}`]);
    }
    async function insert(user, amount, status, time) {
      const id = randomUUID();
      await engine.query('INSERT INTO orders(id,user_id,provider,plan,amount,status,created_at) VALUES ($1,$2,\'platega\',\'support\',$3,$4,$5)', [id, user, amount, status, time]);
      return id;
    }
    await insert(users[0], 300, 'succeeded', 1);
    await insert(users[0], 500, 'succeeded', 2);
    await insert(users[1], 999, 'succeeded', 3);
    await insert(users[1], 5000, 'failed', 4);
    const testPayment = await insert(users[2], 5000, 'succeeded', 5);
    await engine.query('UPDATE orders SET is_test=true WHERE id=$1', [testPayment]);
    const first = await insert(users[0], 1200, 'succeeded', 10);
    const second = await insert(users[1], 1000, 'succeeded', 11);
    await insert(users[0], 5000, 'succeeded', 12);
    for (let n = 2; n < 12; n++) await insert(users[n], 1000 + n, 'succeeded', 12 + n);
    const query = await readFile('scripts/founders-candidates.sql', 'utf8');
    const preview = (await engine.query(query)).rows;
    assert.equal(preview.length, 10);
    assert.equal(preview[0].payment_id, first);
    assert.equal(preview[1].payment_id, second);
    assert.equal(preview[0].amount, '1200.00');
    assert.equal(preview[1].amount, '1000.00');
    for (let replay = 0; replay < 2; replay++) {
      await engine.transaction(async (tx) => {
        for (const row of preview)
          await tx.query(`INSERT INTO founding_members(user_id,founder_number,payment_id,qualifying_amount,first_qualifying_payment_at,created_at)
            VALUES ($1,$2,$3,$4,$5,0) ON CONFLICT(user_id) DO NOTHING`,
            [row.user_id, row.founder_number, row.payment_id, row.amount, row.paid_at]);
        await tx.query('UPDATE founding_sequence SET next_number=$1 WHERE id=1', [11]);
      });
    }
    assert.equal((await engine.query('SELECT count(*) AS n FROM founding_members')).rows[0].n, 10);
    assert.equal((await engine.query('SELECT next_number FROM founding_sequence')).rows[0].next_number, 11);
  } finally { await engine.close(); }
});
