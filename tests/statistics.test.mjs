import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';

test('statistics include old completed episodes only in all-time views and exclude test payments', async () => {
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
      async first() {
        return (await engine.query(sql, values)).rows[0] || null;
      },
      async all() {
        return { results: (await engine.query(sql, values)).rows };
      },
    };
  };
  globalThis.statisticsTestDb = { prepare: prepared };

  try {
    const migrations = (await readdir('migrations/postgres'))
      .filter((name) => name.endsWith('.sql') && name !== '0035_qualified_episode_views.sql')
      .sort();
    for (const name of migrations)
      await engine.exec(await readFile(`migrations/postgres/${name}`, 'utf8'));

    const first = crypto.randomUUID();
    const second = crypto.randomUUID();
    for (const [id, nick] of [[first, 'Первый'], [second, 'Второй']]) {
      await engine.query('INSERT INTO users(id,identity,nick,created_at) VALUES ($1,$2,$3,$4)',
        [id, `stats:${id}`, nick, Date.now()]);
      await engine.query(
        `INSERT INTO history(user_id,anime_id,episode,duration,watched_seconds,completed,updated_at)
         VALUES ($1,1,1,1440,720,1,$2)`,
        [id, Date.now() - 60 * 86400000]);
    }

    await engine.exec(await readFile('migrations/postgres/0035_qualified_episode_views.sql', 'utf8'));
    const old = (await engine.query('SELECT qualified_at FROM qualified_episode_views')).rows;
    assert.equal(old.length, 2);
    assert.ok(old.every((row) => row.qualified_at === null));

    const current = Date.now();
    await engine.query(
      'INSERT INTO qualified_episode_views(user_id,anime_id,episode,qualified_at) VALUES ($1,1,2,$2) ON CONFLICT DO NOTHING',
      [first, current]);
    await engine.query(
      'INSERT INTO qualified_episode_views(user_id,anime_id,episode,qualified_at) VALUES ($1,1,2,$2) ON CONFLICT DO NOTHING',
      [first, current]);
    for (const [id, amount, isTest] of [[first, 500, false], [second, 1000, true]]) {
      await engine.query(
        `INSERT INTO orders(id,user_id,created_at,plan,amount,status,is_test)
         VALUES ($1,$2,$3,'support',$4,'succeeded',$5)`,
        [crypto.randomUUID(), id, current, amount, isTest]);
    }

    const supporterSource = stripTypeScriptTypes(await readFile('lib/server/supporters.ts', 'utf8'))
      .replace("import { db, now } from './core';", 'const db = () => globalThis.statisticsTestDb; const now = () => Date.now();');
    globalThis.statisticsSupporters = await import('data:text/javascript;base64,' + Buffer.from(supporterSource).toString('base64'));
    const statisticsSource = stripTypeScriptTypes(await readFile('lib/server/statistics.ts', 'utf8'))
      .replace("import { db, now } from './core';", 'const db = () => globalThis.statisticsTestDb; const now = () => Date.now();')
      .replace("import { supporterLeaderboard } from './supporters';", 'const { supporterLeaderboard } = globalThis.statisticsSupporters;');
    const { publicStatistics } = await import('data:text/javascript;base64,' + Buffer.from(statisticsSource).toString('base64'));
    const stats = await publicStatistics();

    assert.equal(stats.goal, 60000);
    assert.equal(stats.raised, 500);
    assert.deepEqual(stats.supporters.map((row) => row.id), [first]);
    assert.deepEqual(stats.allTimeViews.map((row) => [row.id, row.views]), [[first, 2], [second, 1]]);
    assert.deepEqual(stats.monthlyViews.map((row) => [row.id, row.views]), [[first, 1]]);
  } finally {
    delete globalThis.statisticsTestDb;
    delete globalThis.statisticsSupporters;
    await engine.close();
  }
});
