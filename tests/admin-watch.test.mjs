import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
const url = (s) =>
  'data:text/javascript;base64,' + Buffer.from(s).toString('base64');
const engine = new PGlite({ extensions: { pg_trgm } });
const source = async (path) =>
  stripTypeScriptTypes(await readFile(path, 'utf8'));
let clock = Date.parse('2026-10-26T12:00:00Z');
function database(connection) {
  return {
    prepare(text) {
      let values = [],
        index = 0;
      let sql = text.replace(/\?/g, () => '$' + ++index);
      if (/^INSERT OR IGNORE/i.test(sql))
        sql =
          sql.replace(/^INSERT OR IGNORE/i, 'INSERT') +
          ' ON CONFLICT DO NOTHING';
      const execute = () => connection.query(sql, values);
      return {
        bind(...args) {
          values = args;
          return this;
        },
        async first() {
          return (await execute()).rows[0] || null;
        },
        async all() {
          return { results: (await execute()).rows };
        },
        run: execute,
      };
    },
    transaction: (fn) => connection.transaction((tx) => fn(database(tx))),
    async batch(list) {
      for (const item of list) await item.run();
    },
  };
}
globalThis.adminWatchDb = database(engine);
const core =
  url(`export const db=()=>globalThis.adminWatchDb; export const now=()=>globalThis.adminWatchClock();
export class ApiError extends Error {constructor(message,status=400){super(message);this.status=status;}}
export const body=r=>r.json();export const sameOrigin=()=>{};export const uid=()=>crypto.randomUUID();
export const json=x=>Response.json(x);export const fail=e=>Response.json({error:e.message},{status:e.status||500});
export const viewer=async()=>({id:'viewer'});`);
globalThis.adminWatchClock = () => clock;
const dailyModule = url(
  (await source('lib/server/daily-watch.ts')).replace(
    "'./core'",
    JSON.stringify(core),
  ),
);
const mocks = {
  '@/lib/server/core': core,
  '@/lib/server/daily-watch': dailyModule,
  '@/lib/server/player-demo': url(
    `export const demoCatalog=async()=>({malId:61316,episodes:[{number:1,duration:1440,voices:[{id:'anistar'}]}]});`,
  ),
  '@/lib/server/activity-actor': url(
    `export const actor=async()=>({user:{id:'viewer'},key:'u:viewer',visitor:'00000000-0000-4000-8000-000000000000'});`,
  ),
  '@/lib/server/library': url(
    `export const getAnime=async()=>({episodes:JSON.stringify([{ordinal:1,duration:1440}])});`,
  ),
  '@/lib/server/recommendations/repository': url(
    'export const markRecommendationsDirty=async()=>{};',
  ),
  '@/lib/server/achievements': url(
    'export const evaluateUserAchievements=async()=>{};',
  ),
  '@/lib/server/referrals': url(
    'export const evaluateReferralQualification=async()=>{};',
  ),
  '@/lib/server/streak': url(
    "export const recordStreakProgress=async()=>{};export const streakDay=()=>'';",
  ),
  '@/lib/server/passport': url('export const clearPassport=()=>{};'),
  '@/lib/watch-progress': url(await source('lib/watch-progress.ts')),
};
let routeSource = await source('app/api/watch/route.ts');
for (const [name, target] of Object.entries(mocks))
  routeSource = routeSource.replaceAll(
    "'" + name + "'",
    JSON.stringify(target),
  );
const route = await import(url(routeSource));
const { recordDailyWatch } = await import(dailyModule);
const admin = await import(
  url(
    (await source('lib/server/admin.ts')).replace(
      "'./core'",
      JSON.stringify(core),
    ),
  )
);
const post = async (input) => {
  const response = await route.POST(
    new Request('https://test.local/api/watch', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );
  return { status: response.status, body: await response.json() };
};
test('daily counters distinguish fresh playback, lifetime progress, thresholds, days and demo sessions', async () => {
  try {
    await engine.exec(
      'CREATE TABLE schema_migrations(name text PRIMARY KEY,applied_at bigint NOT NULL)',
    );
    for (const file of (await readdir('migrations/postgres'))
      .filter((v) => v.endsWith('.sql'))
      .sort()) {
      await engine.exec(await readFile('migrations/postgres/' + file, 'utf8'));
      await engine.query('INSERT INTO schema_migrations VALUES($1,$2)', [
        file,
        clock,
      ]);
    }
    await engine.exec(`INSERT INTO users(id,identity,nick,created_at) VALUES ('viewer','test:viewer','Viewer',1);
    INSERT INTO history(user_id,anime_id,episode,position,duration,watched_seconds,completed,updated_at) VALUES ('viewer',1,1,900,1440,900,1,1);`);
    const start = await post({ action: 'start', anime_id: 1, episode: 1 });
    assert.equal(start.status, 200);
    const token = start.body.token;
    clock += 15000;
    await post({ token, seconds: 0, position: 900 });
    assert.equal(
      (await engine.query('SELECT * FROM daily_views')).rows.length,
      0,
      'old history never creates a zero-play view',
    );
    clock += 15000;
    assert.deepEqual(await post({ token, seconds: 15, position: 915 }), {
      status: 200,
      body: { ok: true },
    });
    assert.equal(
      (await engine.query('SELECT * FROM daily_views')).rows.length,
      0,
    );
    clock += 15000;
    await post({ token, seconds: 15, position: 930 });
    assert.equal(
      (await engine.query('SELECT * FROM daily_views')).rows.length,
      1,
    );
    const before = (
      await engine.query('SELECT seconds FROM daily_episode_watch')
    ).rows[0].seconds;
    await post({ token, seconds: 30, position: 960 });
    assert.equal(
      (await engine.query('SELECT seconds FROM daily_episode_watch')).rows[0]
        .seconds,
      before,
      'duplicate heartbeat adds no time',
    );
    for (let n = 0; n < 23; n++) {
      clock += 30000;
      await post({ token, seconds: 30, position: 960 });
    }
    let dashboard = await admin.dashboard();
    assert.equal(dashboard.completedToday, 1);
    assert.equal(Number(dashboard.viewsToday), 1);
    assert.equal(dashboard.daily[0].completed, 1);
    assert.equal(dashboard.daily[0].hours, 0.2);
    const second = await post({ action: 'start', anime_id: 1, episode: 1 });
    clock += 30000;
    await post({ token: second.body.token, seconds: 30, position: 900 });
    assert.equal(
      (await engine.query('SELECT * FROM daily_views')).rows.length,
      1,
      'new sessions and voices do not duplicate daily views',
    );
    const demo = await post({
      action: 'start',
      anime_id: 61316,
      episode: 1,
      provider: 'demo',
      voiceover: 'anistar',
    });
    assert.equal(demo.status, 200);
    clock += 30000;
    await post({ token: demo.body.token, seconds: 30, position: 30 });
    assert.equal(
      (await engine.query('SELECT * FROM daily_views WHERE anime_id=61316'))
        .rows.length,
      1,
    );
    assert.equal(
      (
        await post({
          action: 'start',
          anime_id: 1,
          episode: 1,
          provider: 'demo',
          voiceover: 'anistar',
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await post({
          action: 'start',
          anime_id: 61316,
          episode: 1,
          provider: 'demo',
          voiceover: 'unknown',
        })
      ).status,
      404,
    );
    await recordDailyWatch(
      globalThis.adminWatchDb,
      'guest',
      2,
      1,
      1440,
      30,
      Date.parse('2026-10-27T00:00:10Z'),
    );
    await recordDailyWatch(
      globalThis.adminWatchDb,
      'guest',
      2,
      1,
      1440,
      30,
      Date.parse('2026-10-27T00:00:10Z'),
    );
    const split = (
      await engine.query(
        "SELECT day,seconds FROM daily_episode_watch WHERE actor='guest' ORDER BY day",
      )
    ).rows;
    assert.deepEqual(split, [
      { day: '2026-10-26', seconds: 20 },
      { day: '2026-10-27', seconds: 10 },
    ]);
    await recordDailyWatch(
      globalThis.adminWatchDb,
      'short',
      3,
      1,
      10,
      30,
      clock,
    );
    assert.equal(
      (
        await engine.query(
          "SELECT seconds FROM daily_episode_watch WHERE actor='short'",
        )
      ).rows[0].seconds,
      10,
      'time is capped to episode duration',
    );
  } finally {
    await engine.close();
    delete globalThis.adminWatchDb;
    delete globalThis.adminWatchClock;
  }
});
