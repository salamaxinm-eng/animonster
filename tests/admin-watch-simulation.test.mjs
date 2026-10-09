import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('administrative simulation advances existing progress once per hour and stops at available episodes', async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile('migrations/postgres/0001_initial.sql','utf8'));
    await db.exec(await readFile('migrations/postgres/0005_personal_recommendations.sql','utf8'));
    await db.exec(await readFile('migrations/postgres/0035_qualified_episode_views.sql','utf8'));
    await db.exec(await readFile('deploy/admin-watch-simulation-schema.sql','utf8'));
    await db.exec(`INSERT INTO users(id,identity,nick,role,created_at) VALUES('owner','email:owner','Owner','admin',0),('target','email:target','Target','user',0);
      INSERT INTO history(user_id,anime_id,episode,duration,watched_seconds,completed,updated_at) SELECT 'target',21,n,1440,1440,1,0 FROM generate_series(1,213) n;
      INSERT INTO qualified_episode_views(user_id,anime_id,episode) SELECT 'target',21,n FROM generate_series(1,213) n;
      INSERT INTO anime_cache(id,data,episodes,updated_at) VALUES(21,'{}','[{"ordinal":214,"duration":1440},{"ordinal":215,"duration":1440}]',0);
      INSERT INTO admin_watch_simulations(id,user_id,actor_id,anime_id,next_run_at) VALUES('job','target','owner',21,0);`);
    const tick=(await readFile('scripts/admin-watch-simulation.sql','utf8')).replace(/^\\set.*$/gm,'');
    const count=async()=>Number((await db.query("SELECT count(*) AS n FROM qualified_episode_views WHERE user_id='target'" )).rows[0].n);
    await db.exec(tick);
    assert.equal(await count(),214);
    assert.equal((await db.query("SELECT completed FROM history WHERE user_id='target' AND episode=214")).rows[0].completed,1);
    await db.exec(tick);
    assert.equal(await count(),214);
    await db.exec("UPDATE admin_watch_simulations SET next_run_at=0");
    await db.exec(tick);
    assert.equal(await count(),215);
    await db.exec("UPDATE admin_watch_simulations SET next_run_at=0");
    await db.exec(tick);
    assert.equal(await count(),215);
    assert.equal((await db.query('SELECT count(*) AS n FROM admin_watch_simulation_events')).rows[0].n,2);
    await db.exec("UPDATE users SET role='user' WHERE id='owner'");
    await db.exec(tick);
    assert.equal((await db.query('SELECT enabled FROM admin_watch_simulations')).rows[0].enabled,false);
  } finally { await db.close(); }
});
