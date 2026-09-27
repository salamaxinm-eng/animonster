import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';

const moduleUrl = (source) =>
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64');

const coreUrl = moduleUrl(`
export const db = () => globalThis.referralTestDatabase;
export const now = () => globalThis.referralTestNow;
export const premium = async () => 0;
export const base = () => 'https://animonster.test';
export const cookie = () => '';
export const uid = () => crypto.randomUUID();
export class ApiError extends Error {}
`);

const cosmeticsUrl = moduleUrl(
  stripTypeScriptTypes(await readFile('lib/server/cosmetics.ts', 'utf8')).replace(
    "'./core'",
    JSON.stringify(coreUrl),
  ),
);
const plusUrl = moduleUrl(
  stripTypeScriptTypes(await readFile('lib/server/plus.ts', 'utf8')).replace(
    "'./core'",
    JSON.stringify(coreUrl),
  ),
);
const rewardsUrl = moduleUrl(
  stripTypeScriptTypes(await readFile('lib/referral-rewards.ts', 'utf8')),
);
const referralUrl = moduleUrl(
  stripTypeScriptTypes(await readFile('lib/referral-url.ts', 'utf8')),
);
const referralsSource = stripTypeScriptTypes(
  await readFile('lib/server/referrals.ts', 'utf8'),
)
  .replace("'./core'", JSON.stringify(coreUrl))
  .replace("'./cosmetics'", JSON.stringify(cosmeticsUrl))
  .replace("'./plus'", JSON.stringify(plusUrl))
  .replace("'../referral-rewards'", JSON.stringify(rewardsUrl))
  .replace("'../referral-url'", JSON.stringify(referralUrl));
const { evaluateReferralQualification } = await import(
  moduleUrl(referralsSource)
);

test('three completed episodes qualify a referral and grant rewards once', async () => {
  const engine = new PGlite({ extensions: { pg_trgm } });
  globalThis.referralTestNow = Date.now();
  globalThis.referralTestDatabase = {
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
    for (const name of migrations)
      await engine.exec(await readFile(`migrations/postgres/${name}`, 'utf8'));

    const referrer = crypto.randomUUID();
    const friend = crypto.randomUUID();
    const referral = crypto.randomUUID();
    await engine.query(
      `INSERT INTO users(id,identity,nick,created_at) VALUES
       ($1,$2,$3,$4),($5,$6,$7,$4)`,
      [
        referrer,
        `test:${referrer}`,
        `owner_${referrer.slice(0, 8)}`,
        globalThis.referralTestNow,
        friend,
        `test:${friend}`,
        `friend_${friend.slice(0, 8)}`,
      ],
    );
    await engine.query(
      `INSERT INTO referral_codes(user_id,code,created_at)
       VALUES ($1,'TESTCODE',$2)`,
      [referrer, globalThis.referralTestNow],
    );
    await engine.query(
      `INSERT INTO referrals(id,referrer_id,referred_user_id,code,registered_at,created_at)
       VALUES ($1,$2,$3,'TESTCODE',$4,$4)`,
      [referral, referrer, friend, globalThis.referralTestNow],
    );

    let result = await evaluateReferralQualification(friend);
    assert.deepEqual(result, { qualified: false, episodes: 0 });

    // A very large watched_seconds value must not qualify an incomplete episode.
    await engine.query(
      `INSERT INTO history(user_id,anime_id,episode,duration,watched_seconds,completed,updated_at)
       VALUES ($1,21,1,720,100000,0,$2)`,
      [friend, globalThis.referralTestNow],
    );
    result = await evaluateReferralQualification(friend);
    assert.deepEqual(result, { qualified: false, episodes: 0 });

    for (let episode = 2; episode <= 3; episode++) {
      await engine.query(
        `INSERT INTO history(user_id,anime_id,episode,duration,watched_seconds,completed,updated_at)
         VALUES ($1,21,$2,720,1,1,$3)`,
        [friend, episode, globalThis.referralTestNow],
      );
      result = await evaluateReferralQualification(friend);
      assert.deepEqual(result, {
        qualified: false,
        episodes: episode - 1,
      });
    }

    await engine.query(
      `INSERT INTO history(user_id,anime_id,episode,duration,watched_seconds,completed,updated_at)
       VALUES ($1,21,4,720,1,1,$2)`,
      [friend, globalThis.referralTestNow],
    );
    result = await evaluateReferralQualification(friend);
    assert.equal(result.qualified, true);
    assert.equal(result.episodes, 3);
    assert.equal(result.referrerId, referrer);

    const [referralRows, friendGrants, milestoneClaims, milestoneCosmetics] =
      await Promise.all([
        engine.query(
          'SELECT status,qualified_at FROM referrals WHERE id=$1',
          [referral],
        ),
        engine.query(
          'SELECT order_id,starts_at,expires,reason FROM grants WHERE user_id=$1',
          [friend],
        ),
        engine.query(
          'SELECT milestone FROM referral_reward_claims WHERE user_id=$1',
          [referrer],
        ),
        engine.query(
          `SELECT c.slug FROM user_cosmetics uc
           JOIN cosmetics c ON c.id=uc.cosmetic_id
           WHERE uc.user_id=$1 ORDER BY c.slug`,
          [referrer],
        ),
      ]);

    assert.equal(referralRows.rows[0].status, 'qualified');
    assert.ok(referralRows.rows[0].qualified_at);
    assert.equal(friendGrants.rows.length, 1);
    assert.equal(
      Number(friendGrants.rows[0].expires) -
        Number(friendGrants.rows[0].starts_at),
      3 * 86400000,
    );
    assert.equal(
      friendGrants.rows[0].reason,
      'Награда приглашённому после 3 просмотренных серий',
    );
    assert.deepEqual(
      milestoneClaims.rows.map((row) => Number(row.milestone)),
      [1],
    );
    assert.deepEqual(
      milestoneCosmetics.rows.map((row) => row.slug),
      ['recruiter', 'referral-bloom'],
    );

    assert.deepEqual(await evaluateReferralQualification(friend), {
      qualified: false,
    });
    const repeated = await engine.query(
      `SELECT
       (SELECT count(*) FROM grants WHERE user_id=$1) AS grants,
       (SELECT count(*) FROM referral_reward_claims WHERE user_id=$2) AS claims`,
      [friend, referrer],
    );
    assert.equal(Number(repeated.rows[0].grants), 1);
    assert.equal(Number(repeated.rows[0].claims), 1);
  } finally {
    await engine.close();
    delete globalThis.referralTestDatabase;
    delete globalThis.referralTestNow;
  }
});
