import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const source = await readFile(new URL('../lib/streak.ts', import.meta.url), 'utf8');
const streak = await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
const sql = (query) => {
  let index = 0;
  return query.replace(/\?/g, () => `$${++index}`);
};

test('migration starts existing users at zero without changing their identity', async () => {
  const database = new PGlite();
  try {
    await database.exec("CREATE TABLE users (id text PRIMARY KEY, identity text NOT NULL, nick text NOT NULL)");
    await database.query("INSERT INTO users(id,identity,nick) VALUES ('old','test:old','Veteran')");
    await database.exec(await readFile(new URL('../migrations/postgres/0036_daily_streak.sql', import.meta.url), 'utf8'));
    const row = (await database.query("SELECT * FROM users WHERE id='old'")).rows[0];
    assert.equal(row.identity, 'test:old');
    assert.equal(row.nick, 'Veteran');
    assert.equal(row.current_streak, 0);
    assert.equal(row.longest_streak, 0);
    assert.equal(row.last_streak_date, null);
  } finally {
    await database.close();
  }
});

test('daily qualification, missed day, restart, and concurrent writes', async () => {
  const database = new PGlite();
  try {
    await database.exec("CREATE TABLE users (id text PRIMARY KEY, identity text NOT NULL, nick text NOT NULL)");
    await database.query("INSERT INTO users(id,identity,nick) VALUES ('u','test:u','User')");
    await database.exec(await readFile(new URL('../migrations/postgres/0036_daily_streak.sql', import.meta.url), 'utf8'));
    const state = async () => (await database.query("SELECT current_streak,longest_streak,last_streak_date FROM users WHERE id='u'")).rows[0];
    const progress = async (day, episode, seconds, duration = 1440) => {
      const result = await database.query(sql(streak.STREAK_DAY_PROGRESS_SQL), ['u', day, 1, episode, seconds, duration]);
      if (Number(result.rows[0].watched_seconds) >= streak.streakThreshold(duration)) {
        const yesterday = streak.previousStreakDate(day);
        await database.query(sql(streak.STREAK_ADVANCE_SQL), [yesterday, yesterday, day, 'u', day]);
      }
    };
    await progress('2026-10-01', 1, 10);
    assert.equal((await state()).current_streak, 0, 'brief playback does not qualify');
    await progress('2026-10-01', 1, 710);
    assert.equal((await state()).current_streak, 1);
    await progress('2026-10-01', 2, 720);
    assert.equal((await state()).current_streak, 1, 'a second episode adds nothing');
    await progress('2026-10-02', 3, 720);
    assert.equal((await state()).current_streak, 2);
    await progress('2026-10-03', 4, 720);
    assert.equal((await state()).current_streak, 3);
    assert.equal(streak.effectiveStreak(await state(), '2026-10-05').current, 0);
    await progress('2026-10-05', 5, 720);
    assert.equal((await state()).current_streak, 1);
    assert.equal((await state()).longest_streak, 3);
    await Promise.all([progress('2026-10-06', 6, 720), progress('2026-10-06', 6, 720)]);
    assert.equal((await state()).current_streak, 2, 'parallel qualification adds one day');
    assert.equal((await state()).longest_streak, 3);
  } finally {
    await database.close();
  }
});

test('calendar days use the configured timezone across midnight', () => {
  const before = Date.parse('2026-10-01T20:50:00Z');
  const after = Date.parse('2026-10-01T21:10:00Z');
  assert.equal(streak.streakDate(before, 'Europe/Moscow'), '2026-10-01');
  assert.equal(streak.streakDate(after, 'Europe/Moscow'), '2026-10-02');
  assert.equal(streak.previousStreakDate('2026-01-01'), '2025-12-31');
  assert.equal(streak.streakTimezone('Invalid/Zone'), 'Europe/Moscow');
});

test('visual tiers select the five supplied asset paths', () => {
  for (const [days, image] of [[1, 1], [7, 7], [30, 30], [100, 100], [365, 365]]) {
    assert.equal(streak.streakAsset(streak.streakTier(days)), `/streak/streak-${image}.png`);
  }
  assert.equal(streak.streakTier(0), 'day');
  assert.equal(streak.effectiveStreak(null, '2026-10-02').current, 0);
  assert.deepEqual(streak.effectiveStreak({}, '2026-10-02'), {
    current: 0, longest: 0, lastActiveDate: null, tier: 'day',
  });
});
