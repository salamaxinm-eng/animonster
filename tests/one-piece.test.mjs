import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';

const url = (s) =>
  'data:text/javascript;base64,' + Buffer.from(s).toString('base64');
async function module(path, replacements = {}) {
  let s = stripTypeScriptTypes(await readFile(path, 'utf8'));
  for (const [a, b] of Object.entries(replacements))
    s = s.replaceAll("'" + a + "'", JSON.stringify(b));
  return url(s);
}
function database(engine) {
  return {
    prepare(source) {
      let values = [],
        i = 0;
      const sql = source.replace(/\?/g, () => '$' + ++i);
      return {
        bind(...v) {
          values = v;
          return this;
        },
        async first() {
          return (await engine.query(sql, values)).rows[0] ?? null;
        },
        async all() {
          return { results: (await engine.query(sql, values)).rows };
        },
        async run() {
          return engine.query(sql, values);
        },
      };
    },
    transaction(fn) {
      return engine.transaction((tx) => fn(database(tx)));
    },
  };
}
const pass = await module('lib/battlepass.ts');
const domainUrl = await module('lib/one-piece.ts', { './battlepass': pass });
const domain = await import(domainUrl);
const config = JSON.parse(
  await readFile('config/one-piece/2026-10-29.v1.json', 'utf8'),
);
const number = (n) => `ACH_ONE_PIECE_${String(n).padStart(3, '0')}`;

test('catalog has 44 explicit definitions, complete saga subarcs, exclusions, crew moments and a frozen snapshot', () => {
  assert.equal(config.achievements.length, 44);
  assert.equal(new Set(config.achievements.map((a) => a.code)).size, 44);
  assert.equal(config.animeId, 21);
  assert.equal(config.snapshotEpisodes.length, 1172);
  const wano = config.arcs.find((a) => a.id === 'wano');
  for (const ep of [895, 896, 907, 1029, 1030])
    assert.ok(!wano.episodes.includes(ep));
  assert.ok(wano.episodes.includes(890) && wano.episodes.includes(1085));
  const enies = config.arcs.find((a) => a.id === 'enies-lobby');
  assert.ok(!enies.episodes.includes(279) && !enies.episodes.includes(291));
  assert.ok(
    config.sagas.find((s) => s.id === 'alabasta').episodes.includes(62),
  );
  assert.ok(
    config.sagas.find((s) => s.id === 'four-emperors').episodes.includes(1088),
  );
  assert.ok(
    config.nakamaEpisodes.includes(381) && config.nakamaEpisodes.includes(980),
  );
  assert.ok(
    config.snapshotEpisodes.includes(54) &&
      !config.snapshotEpisodes.includes(542),
  );
  assert.deepEqual(
    config.achievements.find((a) => a.number === 30).condition.episodes,
    config.snapshotEpisodes,
  );
});
test('coverage, speed, rolling uniqueness, timezone and immutable king rank', () => {
  let coverage = domain.addVerifiedCoverage([], 0, 89, 100);
  assert.equal(coverage.complete, false);
  coverage = domain.addVerifiedCoverage(coverage.ranges, 80, 90, 100);
  assert.equal(coverage.complete, true);
  assert.equal(
    domain
      .addVerifiedCoverage(coverage.ranges, 0, 10, 100)
      .ranges.flat()
      .join(','),
    '0,90',
  );
  assert.equal(domain.verifiedMovement({ t: 0, p: 0 }, { t: 1000, p: 99 }), 0);
  assert.equal(
    domain.verifiedMovement(
      { t: 0, p: 0, rate: 2 },
      { t: 1000, p: 2, rate: 2 },
    ),
    2,
  );
  assert.equal(domain.verifiedMovement({ t: 0, p: 0 }, { t: 10000, p: 10 }), 0);
  assert.equal(
    domain.nightAt(Date.parse('2026-10-28T22:00:00Z'), 'Asia/Yekaterinburg'),
    true,
  );
  assert.equal(domain.validTimezone('fake/zone'), null);
  assert.equal(
    domain.largestRollingCount([
      { episode: 1, completedAt: 0 },
      { episode: 1, completedAt: 0 },
      { episode: 2, completedAt: 7 * 86400000 },
    ]),
    1,
  );
  assert.equal(domain.pirateRank(0, true), 'Король пиратов');
  assert.equal(domain.pirateRank(1000, false), 'Претендент на Короля пиратов');
});

test('real PostgreSQL migrations and verified playback/rewards integration', async (t) => {
  const engine = new PGlite({ extensions: { pg_trgm } });
  globalThis.pieceDb = database(engine);
  globalThis.pieceNow = Date.parse('2026-10-29T12:00:00Z');
  const core = url(
    `export const db=()=>globalThis.pieceDb;export const now=()=>globalThis.pieceNow;export const uid=()=>crypto.randomUUID();export class ApiError extends Error{constructor(m,status=400){super(m);this.status=status;}}`,
  );
  const serviceUrl = await module('lib/server/one-piece.ts', {
    './core': core,
    '../one-piece': domainUrl,
  });
  const service = await import(serviceUrl);
  const watch = await import(
    await module('lib/server/verified-watch.ts', {
      './core': core,
      '../battlepass': pass,
      '../one-piece': domainUrl,
      './one-piece': serviceUrl,
    })
  );
  const q = (sql, values = []) => engine.query(sql, values),
    value = async (sql, values = []) =>
      Number((await q(sql, values)).rows[0]?.n || 0);
  const user = async (id) => {
    await q(
      'INSERT INTO users(id,identity,nick,created_at) VALUES ($1,$2,$1,0)',
      [id, 'test:piece:' + id],
    );
    return id;
  };
  const earned = async (id, n) =>
    value(
      'SELECT count(*) AS n FROM user_achievements WHERE user_id=$1 AND achievement_id=$2',
      [id, number(n)],
    );
  async function playback(
    id,
    ep,
    { provider = 'aniliberty', timezone = 'UTC', samples, token, seq = 1 } = {},
  ) {
    const start = globalThis.pieceNow;
    token ||= (
      await watch.startVerifiedWatch(id, 'auth', {
        episode: ep,
        duration: 10,
        provider,
        voiceover: provider,
        timezone,
        durationBasis: 'fixture',
      })
    ).token;
    samples ||= Array.from({ length: 10 }, (_, i) => ({ t: i * 1000, p: i }));
    globalThis.pieceNow = start + samples.at(-1).t;
    return {
      token,
      result: await watch.recordVerifiedWatch(id, 'auth', token, seq, samples),
      samples,
    };
  }
  async function seed(id, episodes, at = globalThis.pieceNow) {
    await q(
      `INSERT INTO history(user_id,anime_id,episode,duration,completed,watched_seconds,updated_at,episode_id,watched_intervals,verified_duration,verified_completed_at)
  SELECT $1,21,n,1440,1,1296,$3,'tv:21:episode:'||n,'[[0,1296]]',1440,$3 FROM unnest($2::int[]) n ON CONFLICT(user_id,anime_id,episode) DO NOTHING`,
      [id, episodes, at],
    );
  }
  try {
    for (const file of (await readdir('migrations/postgres'))
      .filter((f) => f.endsWith('.sql'))
      .sort())
      await engine.exec(await readFile('migrations/postgres/' + file, 'utf8'));
    assert.equal(
      await value(
        "SELECT count(*) n FROM achievements WHERE metric='verified_condition'",
      ),
      44,
    );
    await engine.exec(
      "UPDATE achievements SET active=1 WHERE metric='verified_condition'",
    );
    await t.test(
      'opening pages and legacy twelve-minute completions do not grant new achievements',
      async () => {
        const id = await user('legacy');
        await q(
          'INSERT INTO history(user_id,anime_id,episode,duration,completed,watched_seconds,updated_at) VALUES ($1,21,1,1440,1,1440,0)',
          [id],
        );
        assert.equal((await service.onePieceOverview(id)).count, 0);
        assert.deepEqual((await service.synchronizePiece(id)).unlocked, []);
        assert.equal(await earned(id, 1), 0);
      },
    );
    await t.test(
      'first episode awards XP once; replay and different source remain one unique episode',
      async () => {
        const id = await user('first'),
          a = await playback(id, 1);
        assert.ok(a.result.unlocked.includes(number(1)));
        assert.equal(await earned(id, 1), 1);
        assert.equal(
          await value('SELECT achievement_xp AS n FROM users WHERE id=$1', [
            id,
          ]),
          10,
        );
        await playback(id, 1, { provider: 'kodik' });
        assert.equal((await service.onePieceOverview(id)).count, 1);
        assert.equal(await earned(id, 1), 1);
        assert.equal(
          await value(
            'SELECT count(*) n FROM episode_completion_events WHERE user_id=$1',
            [id],
          ),
          2,
        );
        const duplicate = await watch.recordVerifiedWatch(
          id,
          'auth',
          a.token,
          1,
          a.samples,
        );
        assert.equal(duplicate.duplicate, true);
        assert.equal(
          await value('SELECT achievement_xp AS n FROM users WHERE id=$1', [
            id,
          ]),
          10,
        );
        assert.equal((await service.claimPieceNotices(id)).length, 1);
        assert.deepEqual(await service.claimPieceNotices(id), []);
      },
    );
    await t.test(
      'jumping to the end does not fill the unseen interval',
      async () => {
        const id = await user('seek');
        await playback(id, 1, {
          samples: [
            { t: 0, p: 0 },
            { t: 1000, p: 9 },
            { t: 2000, p: 10 },
          ],
        });
        assert.equal(await earned(id, 1), 0);
        assert.equal((await service.onePieceOverview(id)).count, 0);
      },
    );
    await t.test(
      'Kodik without a rate event accepts continuous 2x playback across batches, but grants no free seeks',
      async () => {
        const id = await user('kodik-rate'),
          start = globalThis.pieceNow;
        const { token } = await watch.startVerifiedWatch(id, 'auth', {
          episode: 1,
          duration: 10,
          provider: 'kodik',
          voiceover: 'kodik:voice:77',
          timezone: 'UTC',
          durationBasis: 'fixture',
        });
        globalThis.pieceNow = start + 2000;
        await watch.recordVerifiedWatch(id, 'auth', token, 1, [
          { t: 0, p: 0 },
          { t: 1000, p: 2 },
          { t: 2000, p: 4 },
        ]);
        assert.equal(await earned(id, 1), 0);
        globalThis.pieceNow = start + 4500;
        await watch.recordVerifiedWatch(id, 'auth', token, 2, [
          { t: 3000, p: 6 },
          { t: 4000, p: 8 },
          { t: 4500, p: 9 },
        ]);
        assert.equal(await earned(id, 1), 1);
      },
    );
    await t.test(
      'missing one arc episode withholds award; last completion grants all simultaneous conditions',
      async () => {
        const id = await user('arc');
        await playback(id, 1);
        await playback(id, 3);
        assert.equal(await earned(id, 7), 0);
        await playback(id, 2);
        assert.equal(await earned(id, 7), 1);
        for (const ep of [4, 5]) await playback(id, ep);
        assert.equal(await earned(id, 2), 1);
        assert.equal(await earned(id, 33), 0); // one-step reversal is not N-2
      },
    );
    await t.test(
      'saga includes supplemental arcs and grants actual cosmetics atomically',
      async () => {
        const id = await user('saga'),
          saga = config.sagas.find((s) => s.id === 'east-blue');
        await seed(
          id,
          saga.episodes.filter((ep) => ep !== 61),
        );
        await service.synchronizePiece(id);
        assert.equal(await earned(id, 39), 0);
        await playback(id, 61);
        assert.equal(await earned(id, 39), 1);
        assert.equal(await earned(id, 38), 1);
        assert.equal(
          await value(
            "SELECT count(*) n FROM user_cosmetics WHERE user_id=$1 AND cosmetic_id='pin:one-piece-straw-hat'",
            [id],
          ),
          1,
        );
        const before = await value(
          'SELECT achievement_xp AS n FROM users WHERE id=$1',
          [id],
        );
        await service.synchronizePiece(id);
        await service.synchronizePiece(id);
        assert.equal(
          await value('SELECT achievement_xp AS n FROM users WHERE id=$1', [
            id,
          ]),
          before,
        );
      },
    );
    await t.test(
      'secret title, description, condition and reward are masked until earned',
      async () => {
        const id = await user('secret');
        let view = await service.onePieceOverview(id),
          rule = view.achievements.find((a) => a.code === number(33));
        assert.equal(rule.name, '???');
        assert.equal(rule.description, 'Секретное достижение');
        assert.equal(rule.progress, 0);
        assert.equal(rule.threshold, 1);
        assert.deepEqual(rule.rewards, []);
        assert.ok(!JSON.stringify(view).includes('Заблудился, как Зоро'));
        await playback(id, 5);
        await playback(id, 1);
        assert.equal(await earned(id, 33), 1);
        view = await service.onePieceOverview(id);
        rule = view.achievements.find((a) => a.code === number(33));
        assert.equal(rule.name, 'Заблудился, как Зоро');
        assert.equal(rule.completed, true);
        assert.equal(
          (await service.onePieceOverview(id)).achievements.find(
            (a) => a.code === number(33),
          ).completed,
          true,
        );
      },
    );
    await t.test(
      'session pause below 60 minutes survives; 60-minute inactivity resets progress',
      async () => {
        const id = await user('session');
        for (let ep = 1; ep <= 9; ep++) await playback(id, ep);
        assert.equal(await earned(id, 31), 0);
        globalThis.pieceNow += 59 * 60000;
        await playback(id, 10);
        assert.equal(await earned(id, 31), 1);
        const other = await user('broken');
        for (let ep = 1; ep <= 9; ep++) await playback(other, ep);
        globalThis.pieceNow += 60 * 60000;
        await playback(other, 10);
        assert.equal(await earned(other, 31), 0);
      },
    );
    await t.test(
      'return requires previous actual viewing and thirty full days, not page visits',
      async () => {
        const id = await user('return');
        await playback(id, 2);
        globalThis.pieceNow += 30 * 86400000;
        await service.onePieceOverview(id);
        assert.equal(await earned(id, 32), 0);
        await playback(id, 3);
        assert.equal(await earned(id, 32), 1);
      },
    );
    await t.test(
      'night uses the player user timezone and only real completion',
      async () => {
        globalThis.pieceNow = Date.parse('2026-11-30T22:30:00Z');
        const id = await user('night');
        await playback(id, 1, { timezone: 'Asia/Yekaterinburg' });
        assert.equal(await earned(id, 34), 1);
      },
    );
    await t.test(
      'rolling seven days deduplicates episodes and includes full rewatches',
      async () => {
        globalThis.pieceNow = Date.parse('2026-12-10T12:00:00Z');
        const id = await user('rolling');
        await seed(
          id,
          Array.from({ length: 99 }, (_, i) => i + 1),
        );
        await service.synchronizePiece(id);
        assert.equal(await earned(id, 35), 0);
        await playback(id, 100);
        assert.equal(await earned(id, 35), 1);
        const replay = await user('rolling-replay');
        await seed(
          replay,
          Array.from({ length: 100 }, (_, i) => i + 1),
          globalThis.pieceNow - 30 * 86400000,
        );
        // Previously completed at widely spaced times: a recent rewatch window is the evidence.
        await q(
          'UPDATE history SET verified_completed_at=verified_completed_at-episode*8*86400000::bigint WHERE user_id=$1',
          [replay],
        );
        await q(
          `INSERT INTO episode_completion_events(id,user_id,episode_id,completion_index,completed_at,watch_session) SELECT 'rewatch-'||n,$1,'tv:21:episode:'||n,1,$2,'trusted-fixture' FROM generate_series(1,100) n`,
          [replay, globalThis.pieceNow],
        );
        await service.synchronizePiece(replay);
        assert.equal(await earned(replay, 35), 1);
      },
    );
    await t.test(
      'nakama uses the explicit list and the 500-episode return needs a full rewatch',
      async () => {
        const id = await user('nakama');
        await seed(
          id,
          config.nakamaEpisodes.filter((ep) => ep !== 381),
        );
        await service.synchronizePiece(id);
        assert.equal(await earned(id, 36), 0);
        await playback(id, 381);
        assert.equal(await earned(id, 36), 1);
        const other = await user('rewatch');
        const episodes = config.snapshotEpisodes.slice(0, 500);
        await seed(other, episodes);
        await service.synchronizePiece(other);
        assert.equal(await earned(other, 37), 0);
        await playback(other, 1);
        assert.equal(await earned(other, 37), 1);
      },
    );
    await t.test(
      'reward failure rolls back completion, XP, grants, notifications and sequence; identical retry works',
      async () => {
        const id = await user('rollback'),
          saga = config.sagas.find((s) => s.id === 'east-blue');
        await seed(
          id,
          saga.episodes.filter((ep) => ep !== 61),
        );
        await engine.exec(
          `CREATE FUNCTION piece_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id='rollback' THEN RAISE EXCEPTION 'reward failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER piece_test_fail BEFORE INSERT ON user_cosmetics FOR EACH ROW EXECUTE FUNCTION piece_test_fail();`,
        );
        const start = globalThis.pieceNow,
          token = (
            await watch.startVerifiedWatch(id, 'auth', {
              episode: 61,
              duration: 10,
              provider: 'aniliberty',
              voiceover: 'x',
              timezone: 'UTC',
              durationBasis: 'fixture',
            })
          ).token,
          samples = Array.from({ length: 10 }, (_, i) => ({
            t: i * 1000,
            p: i,
          }));
        globalThis.pieceNow = start + 9000;
        await assert.rejects(
          () => watch.recordVerifiedWatch(id, 'auth', token, 1, samples),
          /reward failure/,
        );
        assert.equal(
          await value(
            'SELECT count(*) n FROM user_achievements WHERE user_id=$1',
            [id],
          ),
          0,
        );
        assert.equal(
          await value('SELECT achievement_xp n FROM users WHERE id=$1', [id]),
          0,
        );
        assert.equal(
          await value('SELECT count(*) n FROM notifications WHERE user_id=$1', [
            id,
          ]),
          0,
        );
        assert.equal(
          await value('SELECT seq n FROM watch_sessions WHERE token=$1', [
            token,
          ]),
          0,
        );
        assert.equal(
          await value(
            'SELECT count(*) n FROM history WHERE user_id=$1 AND episode=61',
            [id],
          ),
          0,
        );
        await engine.exec(
          'DROP TRIGGER piece_test_fail ON user_cosmetics; DROP FUNCTION piece_test_fail();',
        );
        await watch.recordVerifiedWatch(id, 'auth', token, 1, samples);
        assert.equal(await earned(id, 39), 1);
      },
    );
    await t.test(
      'concurrent identical and parallel-player requests never double-credit',
      async () => {
        const id = await user('concurrent'),
          start = globalThis.pieceNow,
          selection = {
            episode: 1,
            duration: 10,
            provider: 'aniliberty',
            voiceover: 'x',
            timezone: 'UTC',
            durationBasis: 'fixture',
          };
        const a = await watch.startVerifiedWatch(id, 'auth', selection),
          b = await watch.startVerifiedWatch(id, 'auth', {
            ...selection,
            episode: 2,
          }),
          samples = Array.from({ length: 10 }, (_, i) => ({
            t: i * 1000,
            p: i,
          }));
        globalThis.pieceNow = start + 9000;
        await Promise.all([
          watch.recordVerifiedWatch(id, 'auth', a.token, 1, samples),
          watch.recordVerifiedWatch(id, 'auth', a.token, 1, samples),
        ]);
        await watch.recordVerifiedWatch(id, 'auth', b.token, 1, samples);
        assert.equal(await earned(id, 1), 1);
        assert.equal((await service.onePieceOverview(id)).count, 1);
        assert.equal(
          await value(
            'SELECT count(*) n FROM notifications WHERE user_id=$1 AND achievement_id=$2',
            [id, number(1)],
          ),
          1,
        );
        await assert.rejects(() =>
          watch.recordVerifiedWatch(id, 'wrong-auth', a.token, 2, [
            { t: 10000, p: 10 },
          ]),
        );
      },
    );
    await t.test(
      'all future episodes leave the king snapshot, rank and earned XP intact',
      async () => {
        const id = await user('king');
        await seed(id, config.snapshotEpisodes);
        await service.synchronizePiece(id);
        assert.equal(await earned(id, 30), 1);
        const before = (await service.onePieceOverview(id)).xp;
        await q(
          "INSERT INTO anime_episode_registry(id,anime_id,episode_number) VALUES ('tv:21:episode:1181',21,1181)",
        );
        await service.synchronizePiece(id);
        const view = await service.onePieceOverview(id);
        assert.equal(view.rank, 'Король пиратов');
        assert.equal(view.xp, before);
        assert.equal(view.total, 1172);
      },
    );
    await t.test(
      'unfinished arc never grants a completion achievement even with all currently known episodes',
      async () => {
        const id = await user('unfinished'),
          modified = structuredClone(config);
        modified.arcs.find((a) => a.id === 'egghead').complete = false;
        await q(
          'UPDATE achievement_catalogs SET config=$1::jsonb WHERE active',
          [JSON.stringify(modified)],
        );
        await seed(id, modified.arcs.find((a) => a.id === 'egghead').episodes);
        await service.synchronizePiece(id);
        assert.equal(await earned(id, 24), 0);
        assert.equal(
          (await service.onePieceOverview(id)).achievements.find(
            (a) => a.code === number(24),
          ).available,
          false,
        );
        await q(
          'UPDATE achievement_catalogs SET config=$1::jsonb WHERE active',
          [JSON.stringify(config)],
        );
      },
    );
    await t.test(
      'HTTP boundary enforces auth/origin/source, ignores user_id, waits for duration and binds the token to its owner',
      async () => {
        const apiCore =
          url(`export const db=()=>globalThis.pieceDb;export const now=()=>globalThis.pieceNow;export const uid=()=>crypto.randomUUID();export class ApiError extends Error{constructor(m,status=400){super(m);this.status=status;}}
   export const json=(v,s=200)=>Response.json(v,{status:s});export const fail=e=>json({error:e.message},e.status||500);export const requireUser=async()=>{if(!globalThis.pieceActor)throw new ApiError('Login',401);return globalThis.pieceActor};export const body=r=>r.json();export const hash=async()=> 'auth';export const cookie=()=> 'cookie';export const premium=async()=>0;export const sameOrigin=r=>{if(r.headers.get('origin')!=='https://animonster.su')throw new ApiError('Origin',403);};`);
        const library = url(
            `export async function getAnime(){return {anime:{id:21,name:'One Piece'},episodes:'[{"ordinal":1,"duration":1440}]'}}`,
          ),
          restriction = url(
            'export async function titleBlocked(){return false}',
          );
        const watchUrl = await module('lib/server/verified-watch.ts', {
          './core': core,
          '../battlepass': pass,
          '../one-piece': domainUrl,
          './one-piece': serviceUrl,
        });
        const route = await import(
          await module('app/api/one-piece/watch/route.ts', {
            '@/lib/server/core': apiCore,
            '@/lib/one-piece': domainUrl,
            '@/lib/server/library': library,
            '@/lib/watch-progress': await module('lib/watch-progress.ts'),
            '@/lib/server/title-restrictions': restriction,
            '@/lib/server/verified-watch': watchUrl,
          })
        );
        const request = (body, origin = 'https://animonster.su') =>
          new Request('https://animonster.su/api/one-piece/watch', {
            method: 'POST',
            headers: { origin, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
        const input = {
          action: 'start',
          anime: 21,
          episode: 1,
          provider: 'kodik',
          voiceover: 'kodik:voice:77',
          timezone: 'UTC',
          duration: 1440,
        };
        globalThis.pieceActor = null;
        assert.equal((await route.POST(request(input))).status, 401);
        const id = await user('api-user');
        globalThis.pieceActor = { id, identity: 'test:api', role: 'user' };
        assert.equal(
          (await route.POST(request(input, 'https://evil.example'))).status,
          403,
        );
        assert.equal(
          (await route.POST(request({ ...input, anime: 269 }))).status,
          400,
        );
        const unknown = await route.POST(request({ ...input, duration: null }));
        assert.equal((await unknown.json()).token, null);
        assert.equal(await earned(id, 1), 0);
        await q(
          "INSERT INTO anime_cache(id,data,episodes,updated_at) VALUES (21,'{}','[]',0) ON CONFLICT DO NOTHING",
        );
        await q(
          "INSERT INTO kodik_episode_links(anime_id,translation_id,episode,player_url,updated_at) VALUES (21,77,1,'https://kodikplayer.com/fixture',0)",
        );
        await q(
          `INSERT INTO anime_sources(provider,source_id,anime_id,translation_id,episodes_count,last_seen_at,payload)
        VALUES ('kodik','test-op',21,77,1,0,$1)`,
          [
            JSON.stringify({
              seasons: {
                0: { episodes: { 1: 'https://kodikplayer.com/special' } },
                1: { episodes: { 1: 'https://kodikplayer.com/fixture' } },
              },
            }),
          ],
        );
        assert.equal(
          (await route.POST(request({ ...input, episode: 9999 }))).status,
          404,
        );
        const response = await route.POST(
          request({ ...input, user_id: 'king', xp: 999999 }),
        );
        assert.equal(response.status, 200);
        const token = (await response.json()).token;
        assert.equal(
          (
            await q('SELECT user_id FROM watch_sessions WHERE token=$1', [
              token,
            ])
          ).rows[0].user_id,
          id,
        );
        const future = await route.POST(
          request({ token, seq: 1, samples: [{ t: 14400000, p: 1440 }] }),
        );
        assert.equal(future.status, 400);
        globalThis.pieceActor = {
          id: 'first',
          identity: 'test:first',
          role: 'user',
        };
        assert.equal(
          (
            await route.POST(
              request({ token, seq: 1, samples: [{ t: 0, p: 0 }] }),
            )
          ).status,
          409,
        );
        const adminRoute = await import(
          await module('app/api/one-piece/admin/route.ts', {
            '@/lib/server/core': apiCore,
            '@/lib/server/one-piece': serviceUrl,
          })
        );
        assert.equal((await adminRoute.GET(request({}))).status, 403);
        globalThis.pieceActor = { id, identity: 'test:api', role: 'admin' };
        assert.equal((await adminRoute.GET(request({}))).status, 200);
        const update = {
          ...config.achievements[0],
          xp_reward: 15,
          active: true,
          condition_config: { type: 'episodes', episodes: [1] },
        };
        assert.equal((await adminRoute.PATCH(request(update))).status, 200);
        assert.equal(
          await value(
            'SELECT xp_awarded n FROM user_achievements WHERE user_id=$1 AND achievement_id=$2',
            ['first', number(1)],
          ),
          10,
        );
        assert.equal(
          (await adminRoute.PATCH(request({ ...update, xp_reward: -1 })))
            .status,
          400,
        );
        delete globalThis.pieceActor;
      },
    );
  } finally {
    await engine.close();
    delete globalThis.pieceDb;
    delete globalThis.pieceNow;
  }
});
