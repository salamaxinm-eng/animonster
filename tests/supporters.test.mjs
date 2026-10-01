import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';

const source = stripTypeScriptTypes(await readFile('lib/server/supporters.ts', 'utf8'))
  .replace(
    "import { db, now } from './core';",
    'const db = () => globalThis.supporterTestDb; const now = () => Date.now();',
  );
const { supporterLeaderboard, refreshSupporterChampion } = await import(
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
);

test('all successful payments rank supporters and transfer the exclusive champion pin', async () => {
  const engine = new PGlite({ extensions: { pg_trgm } });
  const prepared = (source) => {
    let values = [];
    let index = 0;
    const sql = source.replace(/\?/g, () => '$' + ++index);
    return {
      bind(...params) {
        values = params;
        return this;
      },
      async all() {
        return { results: (await engine.query(sql, values)).rows };
      },
      async executeWith(connection) {
        return connection.query(sql, values);
      },
    };
  };
  globalThis.supporterTestDb = {
    prepare: prepared,
    batch: (statements) =>
      engine.transaction(async (connection) => {
        for (const statement of statements) await statement.executeWith(connection);
      }),
  };

  try {
    const migrations = (await readdir('migrations/postgres'))
      .filter((name) => name.endsWith('.sql'))
      .sort();
    for (const name of migrations)
      await engine.exec(await readFile(`migrations/postgres/${name}`, 'utf8'));

    const users = Array.from({ length: 4 }, () => crypto.randomUUID());
    for (const [index, id] of users.entries()) {
      await engine.query(
        'INSERT INTO users(id,identity,nick,created_at) VALUES ($1,$2,$3,$4)',
        [id, `test:${id}`, `Supporter ${index + 1}`, Date.now()],
      );
    }
    const orders = [
      [users[0], 'support', 300, 'succeeded'],
      [users[0], 'monthly', 109, 'succeeded'],
      [users[1], 'annual', 999, 'succeeded'],
      [users[2], 'annual', 961.2, 'succeeded'],
      [users[0], 'support', 100000, 'canceled'],
    ];
    for (const [index, [userId, plan, amount, status]] of orders.entries()) {
      await engine.query(
        `INSERT INTO orders(id,user_id,created_at,plan,amount,status)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [crypto.randomUUID(), userId, index + 1, plan, amount, status],
      );
    }

    for (const [userId, source] of [[users[0], 'purchase'], [users[3], 'admin']]) {
      await engine.query(
        `UPDATE users SET pin='champion-crown',tag='number-one',profile_frame='champion-gold'
         WHERE id=$1`,
        [userId],
      );
      await engine.query(
        `INSERT INTO user_cosmetics(user_id,cosmetic_id,unlocked_at,source)
         SELECT $1,id,$2,$3 FROM cosmetics
         WHERE id IN ('tag:number-one','frame:champion-gold','pin:champion-crown')`,
        [userId, Date.now(), source],
      );
    }

    await refreshSupporterChampion();
    const ranking = await supporterLeaderboard();
    assert.deepEqual(ranking.map((row) => [row.id, row.amount]), [
      [users[1], 999],
      [users[2], 961.2],
      [users[0], 409],
    ]);
    const awards = async () =>
      (await engine.query(
        `SELECT user_id,cosmetic_id,source FROM user_cosmetics
         WHERE cosmetic_id IN ('tag:number-one','frame:champion-gold','pin:champion-crown')
         ORDER BY cosmetic_id`,
      )).rows;
    const assertAwards = async (leader) => {
      const rows = await awards();
      assert.equal(rows.length, 5);
      assert.deepEqual(
        rows.filter((row) => row.cosmetic_id === 'pin:champion-crown').map((row) => row.user_id),
        [leader],
      );
      assert.equal(rows.filter((row) => row.user_id === leader && row.source === 'purchase').length, 3);
      assert.equal(rows.filter((row) => row.user_id === users[3] && row.source === 'admin').length, 2);
    };
    await assertAwards(users[1]);
    const equipped = await engine.query(
      'SELECT id,pin,tag,profile_frame FROM users WHERE id=ANY($1::text[])',
      [users],
    );
    assert.equal(equipped.rows.find((row) => row.id === users[0]).pin, null);
    assert.equal(equipped.rows.find((row) => row.id === users[0]).tag, null);
    assert.equal(equipped.rows.find((row) => row.id === users[0]).profile_frame, 'none');
    assert.equal(equipped.rows.find((row) => row.id === users[1]).pin, 'champion-crown');
    assert.equal(equipped.rows.find((row) => row.id === users[3]).pin, null);
    assert.equal(equipped.rows.find((row) => row.id === users[3]).tag, 'number-one');
    assert.equal(equipped.rows.find((row) => row.id === users[3]).profile_frame, 'champion-gold');

    // Deployment reconciliation also revokes older manual grants.
    await engine.query(
      `INSERT INTO user_cosmetics(user_id,cosmetic_id,unlocked_at,source)
       VALUES ($1,'pin:champion-crown',$2,'admin')`,
      [users[0], Date.now()],
    );
    await engine.query("UPDATE users SET pin='champion-crown' WHERE id=$1", [users[0]]);
    await engine.exec(await readFile('migrations/postgres/0033_all_paid_supporter_champion.sql', 'utf8'));
    await assertAwards(users[1]);
    assert.equal(
      (await engine.query('SELECT pin FROM users WHERE id=$1', [users[0]])).rows[0].pin,
      null,
    );

    await refreshSupporterChampion();
    await assertAwards(users[1]);

    await engine.query("UPDATE orders SET status='chargebacked' WHERE user_id=$1", [users[1]]);
    await refreshSupporterChampion();
    assert.equal((await supporterLeaderboard())[0].id, users[2]);
    await assertAwards(users[2]);
  } finally {
    delete globalThis.supporterTestDb;
    await engine.close();
  }
});
