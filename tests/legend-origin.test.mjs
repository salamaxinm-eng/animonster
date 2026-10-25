import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
const url = (s) =>
  'data:text/javascript;base64,' + Buffer.from(s).toString('base64');
const load = async (path) => stripTypeScriptTypes(await readFile(path, 'utf8'));
function database(connection) {
  return {
    prepare(text) {
      let values = [],
        index = 0;
      const sql = text.replace(/\?/g, () => '$' + ++index);
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
  };
}
const core =
  url(`export const db=()=>globalThis.legendDb;export const now=()=>globalThis.legendClock;
export class ApiError extends Error {constructor(message,status=400){super(message);this.status=status;}}
export const body=request=>request.json();export const json=value=>Response.json(value);export const fail=e=>Response.json({error:e.message},{status:e.status||500});
export const sameOrigin=request=>{if(request.headers.get('origin')!=='https://test.local')throw new ApiError('Forbidden',403);};
export const viewer=async request=>request.headers.get('x-test-user')?globalThis.legendDb.prepare('SELECT * FROM users WHERE id=?').bind(request.headers.get('x-test-user')).first():null;`);
const rewardUrl = url(
  (await load('lib/server/legend-origin.ts')).replace(
    "'./core'",
    JSON.stringify(core),
  ),
);
const state = await import(rewardUrl);
const route = await import(
  url(
    (await load('app/api/rewards/legend-origin/route.ts'))
      .replace("'@/lib/server/core'", JSON.stringify(core))
      .replace("'@/lib/server/legend-origin'", JSON.stringify(rewardUrl)),
  )
);
const get = (user) =>
  route.GET(
    new Request('https://test.local/api/rewards/legend-origin', {
      headers: user ? { 'x-test-user': user } : {},
    }),
  );
const ack = (user, origin = 'https://test.local') =>
  route.POST(
    new Request('https://test.local/api/rewards/legend-origin', {
      method: 'POST',
      headers: { origin, 'x-test-user': user },
      body: JSON.stringify({ userId: user, user_id: 'recipient' }),
    }),
  );
test('personal legend grants are permanent, targeted, audited and idempotent; celebration is private and acknowledged once', async () => {
  const engine = new PGlite({ extensions: { pg_trgm } });
  globalThis.legendDb = database(engine);
  globalThis.legendClock = 1800000000000;
  try {
    for (const file of (await readdir('migrations/postgres'))
      .filter((n) => n.endsWith('.sql'))
      .sort())
      await engine.exec(await readFile('migrations/postgres/' + file, 'utf8'));
    await engine.exec(
      "INSERT INTO users(id,identity,nick,role,created_at) VALUES ('owner','test:owner','Owner','admin',1),('recipient','test:recipient','Supporter','user',1),('other','test:other','Other','user',1)",
    );
    const grant = (owner = 'owner', recipient = 'recipient') =>
      engine.exec(
        grantSource
          .replaceAll(":'owner_id'", "'" + owner + "'")
          .replaceAll(":'recipient_id'", "'" + recipient + "'"),
      );
    const grantSource = await readFile(
      'scripts/grant-legend-origin.sql',
      'utf8',
    );
    await grant();
    await grant();
    const grants = (
      await engine.query(
        'SELECT user_id,lifetime,expires FROM grants ORDER BY user_id',
      )
    ).rows;
    assert.deepEqual(grants, [
      { user_id: 'owner', lifetime: true, expires: 0 },
      { user_id: 'recipient', lifetime: true, expires: 0 },
    ]);
    assert.equal(
      (await engine.query('SELECT * FROM user_cosmetics')).rows.length,
      2,
    );
    assert.equal(
      (await engine.query('SELECT * FROM moderation_actions')).rows.length,
      2,
    );
    assert.equal(
      (await engine.query('SELECT * FROM orders')).rows.length,
      0,
      'honorary gifts never fabricate financial support',
    );
    assert.equal(
      (await engine.query('SELECT * FROM founding_members')).rows.length,
      0,
      'honorary gifts do not consume Founder seats',
    );
    assert.equal((await get()).status, 401);
    assert.equal((await (await get('recipient')).json()).pending, true);
    assert.equal(
      (await (await get('recipient')).json()).pending,
      true,
      'reading is not acknowledgement',
    );
    assert.equal((await (await get('other')).json()).pending, false);
    assert.equal((await ack('other')).status, 200);
    assert.equal(
      (await (await get('recipient')).json()).pending,
      true,
      'supplied user_id cannot acknowledge another account',
    );
    assert.equal((await ack('recipient', 'https://evil.invalid')).status, 403);
    assert.equal((await ack('recipient')).status, 200);
    assert.equal((await (await get('recipient')).json()).pending, false);
    globalThis.legendClock += 10000;
    await ack('recipient');
    const user = (
      await engine.query("SELECT * FROM users WHERE id='recipient'")
    ).rows[0];
    assert.equal(
      Number(user.legend_origin_seen_at),
      1800000000000,
      'duplicate closes retain the original timestamp',
    );
    assert.equal(state.legendOriginState(user).pending, false);
    await engine.exec("UPDATE users SET tag='plus' WHERE id='recipient'");
    await grant();
    const rerun = (
      await engine.query(
        "SELECT tag,legend_origin_at,legend_origin_seen_at FROM users WHERE id='recipient'",
      )
    ).rows[0];
    assert.equal(
      rerun.tag,
      'plus',
      'rerun preserves a later choice of cosmetic',
    );
    assert.equal(
      Number(rerun.legend_origin_seen_at),
      1800000000000,
      'rerun never reopens the celebration',
    );
    assert.ok(
      Number(rerun.legend_origin_at) > 0,
      'nickname entitlement remains after changing the tag',
    );
    await assert.rejects(grant('other'));
  } finally {
    await engine.close();
    delete globalThis.legendDb;
    delete globalThis.legendClock;
  }
});
