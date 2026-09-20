import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';

const moduleUrl = (source) =>
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const coreUrl = moduleUrl(`
export const db = () => globalThis.rewardTestDatabase;
export const now = () => Date.now();
export const premium = async () => 0;
export class ApiError extends Error {}
`);
const cosmeticSource = stripTypeScriptTypes(
  await readFile('lib/server/cosmetics.ts', 'utf8'),
).replace("'./core'", JSON.stringify(coreUrl));
const cosmeticUrl = moduleUrl(cosmeticSource);
const cosmetics = await import(cosmeticUrl);
const achievementSource = stripTypeScriptTypes(
  await readFile('lib/server/achievements.ts', 'utf8'),
)
  .replace("'./core'", JSON.stringify(coreUrl))
  .replace("'./cosmetics'", JSON.stringify(cosmeticUrl));
const { evaluateUserAchievements, userAchievementProgress } = await import(
  moduleUrl(achievementSource)
);

test('anime rewards use completed episodes, unlock retroactively once, and preserve permanent access', async () => {
  const engine = new PGlite({ extensions: { pg_trgm } });
  globalThis.rewardTestDatabase = {
    prepare(source) {
      let values = [];
      let index = 0;
      const query = source.replace(/\?/g, () => '$' + ++index);
      return {
        bind(...params) {
          values = params;
          return this;
        },
        async first() {
          return (await engine.query(query, values)).rows[0] ?? null;
        },
        async all() {
          return { results: (await engine.query(query, values)).rows };
        },
        async run() {
          return engine.query(query, values);
        },
      };
    },
  };
  try {
    const migrations = (await readdir('migrations/postgres'))
      .filter((name) => name.endsWith('.sql'))
      .sort();
    for (const name of migrations.filter((name) => name < '0021'))
      await engine.exec(await readFile('migrations/postgres/' + name, 'utf8'));
    await engine.exec(`INSERT INTO users(id,identity,nick,created_at) VALUES ('veteran','test:veteran','veteran',1),('friend1','test:f1','f1',1),('friend2','test:f2','f2',1),('friend3','test:f3','f3',1);
      INSERT INTO user_achievements VALUES ('veteran','achievement:one-piece-100',1);
      INSERT INTO referrals(id,referrer_id,referred_user_id,code,status,registered_at,qualified_at,created_at)
        SELECT 'ref' || n,'veteran','friend' || n,'TESTCODE','qualified',1,2,1 FROM generate_series(1,3) n;`);
    for (const name of migrations.filter((name) => name >= '0021'))
      await engine.exec(await readFile('migrations/postgres/' + name, 'utf8'));
    assert.equal(
      await cosmetics.validateEquippedCosmetic(
        'veteran',
        'pin',
        'achievement-one-piece',
      ),
      'achievement-one-piece',
    );
    assert.equal(
      await cosmetics.validateEquippedCosmetic(
        'veteran',
        'frame',
        'referral-wings',
      ),
      'referral-wings',
    );
    assert.equal(
      await cosmetics.validateEquippedCosmetic(
        'veteran',
        'frame',
        'referral-bloom',
      ),
      'referral-bloom',
    );
    await assert.rejects(() =>
      cosmetics.validateEquippedCosmetic('veteran', 'frame', 'referral-tide'),
    );
    await engine.exec(
      `INSERT INTO users(id,identity,nick,created_at) VALUES ('watcher','test:watcher','watcher',1),('other','test:other','other',1)`,
    );
    const history = async (id, episodes, completed = 1) =>
      engine.query(
        `INSERT INTO history(user_id,anime_id,episode,duration,watched_seconds,completed,updated_at)
      SELECT 'watcher',$1,n,1440,720,$3,1 FROM generate_series(1,$2::integer) n ON CONFLICT DO NOTHING`,
        [id, episodes, completed],
      );
    await history(20, 49);
    await history(269, 50);
    await history(52991, 28, 0);
    await evaluateUserAchievements('watcher');
    await assert.rejects(() =>
      cosmetics.validateEquippedCosmetic(
        'watcher',
        'pin',
        'achievement-naruto',
      ),
    );
    await assert.rejects(() =>
      cosmetics.validateEquippedCosmetic(
        'watcher',
        'frame',
        'achievement-mage',
      ),
    );
    assert.equal(
      await cosmetics.validateEquippedCosmetic(
        'watcher',
        'pin',
        'achievement-bleach',
      ),
      'achievement-bleach',
    );
    await history(20, 50);
    const unlock = await evaluateUserAchievements('watcher', 20);
    assert.ok(unlock.unlocked.includes('naruto'));
    assert.equal(
      await cosmetics.validateEquippedCosmetic(
        'watcher',
        'frame',
        'achievement-shinobi',
      ),
      'achievement-shinobi',
    );
    assert.equal(
      await cosmetics.validateEquippedCosmetic(
        'watcher',
        'pin',
        'achievement-naruto',
      ),
      'achievement-naruto',
    );
    assert.deepEqual(
      (await evaluateUserAchievements('watcher', 20)).unlocked,
      [],
    );
    await assert.rejects(() =>
      cosmetics.validateEquippedCosmetic('other', 'pin', 'achievement-naruto'),
    );
    await assert.rejects(() =>
      cosmetics.validateEquippedCosmetic('watcher', 'frame', 'plus-sakura'),
    );
    await history(21, 100);
    await engine.exec(
      `INSERT INTO user_achievements VALUES ('watcher','achievement:one-piece-100',1)`,
    );
    await evaluateUserAchievements('watcher');
    assert.equal(
      await cosmetics.validateEquippedCosmetic(
        'watcher',
        'pin',
        'achievement-one-piece',
      ),
      'achievement-one-piece',
    );
    const progress = await userAchievementProgress('watcher');
    assert.equal(
      progress.achievements.find((a) => a.slug === 'naruto').progress,
      50,
    );
    assert.equal(
      progress.achievements.find((a) => a.slug === 'frieren').progress,
      0,
    );
    assert.equal(
      progress.achievements.find((a) => a.slug === 'naruto').rewards.length,
      2,
    );
    const catalog = await cosmetics.cosmeticsCatalog('watcher');
    assert.equal(
      catalog.filter((c) => c.kind === 'pin' && c.access_type === 'achievement')
        .length,
      11,
    );
    const { referralMilestones } = await import(
      moduleUrl(
        stripTypeScriptTypes(await readFile('lib/referral-rewards.ts', 'utf8')),
      )
    );
    for (const stage of referralMilestones) {
      for (const slug of stage.cosmetics)
        assert.ok(
          catalog.some((c) => c.slug === slug),
          `Missing referral cosmetic ${slug}`,
        );
      assert.ok(stage.cosmetics.includes(stage.frame));
    }
    for (const item of catalog) {
      if (item.image) await access('public' + item.image);
      if (item.kind === 'frame') await access(`public/frames/${item.slug}.svg`);
    }
  } finally {
    delete globalThis.rewardTestDatabase;
    await engine.close();
  }
});
