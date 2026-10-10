import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { PGlite } from '@electric-sql/pglite';

const source = stripTypeScriptTypes(await readFile('lib/passport-metrics.ts', 'utf8'));
const { passportArchetype, normalizePassportGenre } = await import(
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
);

test('passport archetypes use explicit thresholds and start neutral', () => {
  const base = { episodes: 2, anime: 1, genres: 1, ongoing: 0, longest: 2, night: 0 };
  assert.equal(passportArchetype(base).name, 'Начало истории');
  assert.equal(passportArchetype({ ...base, episodes: 1000 }).name, 'Легенда AniMonster');
  assert.equal(passportArchetype({ ...base, episodes: 40, anime: 5, ongoing: 3 }).name, 'Охотник за онгоингами');
  assert.equal(passportArchetype({ ...base, episodes: 40, anime: 8, genres: 8 }).name, 'Исследователь миров');
  assert.equal(passportArchetype({ ...base, episodes: 80, longest: 75 }).name, 'Мастер марафонов');
  assert.equal(passportArchetype({ ...base, episodes: 30, night: 20 }).name, 'Ночной зритель');
});

test('genre names merge aliases and е/ё forms', () => {
  assert.equal(normalizePassportGenre('shonen'), normalizePassportGenre('Сёнен'));
  assert.equal(normalizePassportGenre('  ФЭНТЕЗИ  '), normalizePassportGenre('Fantasy'));
});

test('passport settings default to hidden and watched episodes stay unique', async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE TABLE users(id text PRIMARY KEY)');
    await db.exec('CREATE TABLE qualified_episode_views(user_id text,anime_id integer,episode integer,qualified_at bigint,PRIMARY KEY(user_id,anime_id,episode))');
    await db.exec(await readFile('migrations/postgres/0044_anime_passport.sql', 'utf8'));
    await db.exec(await readFile('migrations/postgres/0045_passport_simulation_provenance.sql', 'utf8'));
    await db.query("INSERT INTO users(id) VALUES ('viewer')");
    const unseen = await db.query("SELECT 1 FROM passport_settings WHERE user_id='viewer' AND is_public=1");
    assert.equal(unseen.rows.length, 0);
    await db.query("INSERT INTO qualified_episode_views(user_id,anime_id,episode,qualified_at) VALUES ('viewer',1,1,1234) ON CONFLICT DO NOTHING");
    await db.query("INSERT INTO qualified_episode_views(user_id,anime_id,episode,qualified_at) VALUES ('viewer',1,1,5678) ON CONFLICT DO NOTHING");
    assert.equal((await db.query("SELECT COUNT(*)::integer AS count FROM qualified_episode_views WHERE user_id='viewer'")).rows[0].count, 1);
    await db.query("INSERT INTO admin_watch_simulations(id,user_id,actor_id,anime_id,next_run_at) VALUES ('job','viewer','viewer',1,0)");
    await db.query("INSERT INTO admin_watch_simulation_events(job_id,episode,added_at) VALUES ('job',2,1234)");
    await db.query("INSERT INTO qualified_episode_views(user_id,anime_id,episode,qualified_at) VALUES ('viewer',1,2,1234)");
    await db.query("DELETE FROM admin_watch_simulations WHERE id='job'");
    const real = await db.query(`SELECT COUNT(*)::integer AS count FROM qualified_episode_views q
      WHERE q.user_id='viewer' AND NOT EXISTS (
        SELECT 1 FROM passport_simulated_episodes s
        WHERE s.user_id=q.user_id AND s.anime_id=q.anime_id AND s.episode=q.episode)`);
    assert.equal(real.rows[0].count, 1);
  } finally { await db.close(); }
});
