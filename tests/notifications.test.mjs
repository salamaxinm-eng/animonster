import assert from 'node:assert/strict';
import { test, beforeEach, after } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';

const url = (text) =>
  'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
async function load(path, replacements) {
  let source = stripTypeScriptTypes(await readFile(path, 'utf8'));
  for (const [from, to] of Object.entries(replacements))
    source = source.replaceAll(`'${from}'`, JSON.stringify(to));
  return url(source);
}
const engine = new PGlite({ extensions: { pg_trgm } });
for (const file of (await readdir('migrations/postgres'))
  .filter((x) => x.endsWith('.sql'))
  .sort())
  await engine.exec(await readFile('migrations/postgres/' + file, 'utf8'));
function adapter(connection) {
  return {
    prepare(source) {
      let n = 0,
        values = [];
      const query = source.replace(/\?/g, () => '$' + ++n);
      const execute = (target = connection) => target.query(query, values);
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
        async run() {
          const r = await execute();
          return { meta: { changes: r.affectedRows || 0 } };
        },
        execute,
      };
    },
    transaction: (callback) =>
      connection.transaction((tx) => callback(adapter(tx))),
    batch: (statements) =>
      connection.transaction(async (tx) => {
        for (const s of statements) await s.execute(tx);
      }),
  };
}
globalThis.notificationTest = {
  database: adapter(engine),
  time: Date.now(),
  env: {
    TELEGRAM_BOT_TOKEN: 'test-only',
    TELEGRAM_BOT_USERNAME: 'test_bot',
    TELEGRAM_WEBHOOK_SECRET: 'test-secret-at-least-24-characters',
    SITE_URL: 'https://animonster.su',
  },
};
const original = await readFile('lib/server/core.ts', 'utf8');
const premium = stripTypeScriptTypes(
  original.slice(
    original.indexOf('export async function premium('),
    original.indexOf('export async function publicUser('),
  ),
);
const core = url(`
export const db=()=>globalThis.notificationTest.database;
export const now=()=>globalThis.notificationTest.time;
export const runtime=()=>globalThis.notificationTest.env;
export const uid=()=>crypto.randomUUID();
export const hash=async s=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))).toString('hex');
export const json=(v,status=200)=>Response.json(v,{status});
export class ApiError extends Error {constructor(message,status=400){super(message);this.status=status}}
export const fail=e=>json({error:e.message},e.status||500);
export const body=r=>r.json();
export const sameOrigin=r=>{if(r.headers.get('origin')!==new URL(r.url).origin)throw new ApiError('Origin rejected',403)};
export const requireUser=async r=>{const id=r.headers.get('x-test-user');const u=id&&await db().prepare('SELECT * FROM users WHERE id=?').bind(id).first();if(!u)throw new ApiError('Login required',401);return u};
export const viewer=async r=>r.headers.get('x-test-user')?requireUser(r):null;
export const isModerator=()=>false;export const publicUser=u=>u;
export const inviteRequired=()=>false;export const emailVerificationEnabled=()=>false;
${premium}`);
const plus = await load('lib/server/plus.ts', { './core': core });
const queueUrl = await load('lib/server/episode-notifications.ts', {
  './core': core,
});
const { queueEpisodeNotifications } = await import(queueUrl);
const access = await load('lib/server/episode-access.ts', {
  './core': core,
  './plus': plus,
});
const { runPlusWorker } = await import(
  await load('lib/server/plus-worker.ts', {
    './core': core,
    './episode-access': access,
    './episode-notifications': queueUrl,
    './anime': url(
      'export const liberty=async()=>{throw new Error("No upstream expected")};export const normalize=x=>x;',
    ),
    './watch-parties': url('export const cleanupWatchParties=async()=>({});'),
    './battlepass': url('export const settlePasses=async()=>({});'),
  })
);
const telegram = await import(
  await load('app/api/telegram/route.ts', {
    '@/lib/server/core': core,
    '@/lib/server/plus': plus,
  })
);
const community = await import(
  await load('app/api/community/route.ts', {
    '@/lib/server/core': core,
    '@/lib/server/payment-gateway': url(
      'export const paymentsReady=()=>false;',
    ),
    '@/lib/server/social-auth': url('export const socialReady=()=>false;'),
    '@/lib/profile-social': url('export const profileSocialUrl=x=>x;'),
    '@/lib/server/library': url('export const getAnime=async()=>null;'),
    '@/lib/community': url('export const themes=[];export const avatars=[];'),
    '@/lib/server/recommendations/repository': url(
      'export const markRecommendationsDirty=async()=>{};',
    ),
    '@/lib/server/plus': plus,
    '@/lib/server/images': url('export const safeRemoteImageUrl=x=>x;'),
    '@/lib/server/cosmetics': url(
      'export const validateEquippedCosmetic=async()=>{};',
    ),
  })
);
const userA = '11111111-1111-4111-8111-111111111111',
  userB = '22222222-2222-4222-8222-222222222222';
const post = (route, who, value) =>
  route.POST(
    new Request(
      'https://animonster.su/api/' +
        (route === telegram ? 'telegram' : 'community'),
      {
        method: 'POST',
        headers: {
          origin: 'https://animonster.su',
          'content-type': 'application/json',
          'x-test-user': who,
        },
        body: JSON.stringify(value),
      },
    ),
  );
const rows = async (sql) => (await engine.query(sql)).rows;
beforeEach(async () => {
  await engine.exec(
    'TRUNCATE users CASCADE; DELETE FROM anime_cache; DELETE FROM episode_availability; DELETE FROM anime_episode_availability; DELETE FROM plus_system_state;',
  );
  await engine.query(
    "INSERT INTO plus_system_state(key,value,updated_at) VALUES('episode_bootstrap','complete',$1)",
    [globalThis.notificationTest.time],
  );
  for (const [id, nick] of [
    [userA, 'A'],
    [userB, 'B'],
  ])
    await engine.query(
      'INSERT INTO users(id,identity,nick,created_at) VALUES($1,$2,$3,$4)',
      [id, 'test:' + id, nick, globalThis.notificationTest.time],
    );
});
after(() => engine.close());
async function subscribe(who, anime = 21) {
  await engine.query(
    'INSERT INTO telegram_subscriptions(user_id,anime_id,title,created_at) VALUES($1,$2,$3,$4)',
    [who, anime, 'Тестовое аниме', globalThis.notificationTest.time],
  );
}
async function link(who, id = 12345) {
  await engine.query(
    'INSERT INTO telegram_accounts(user_id,telegram_id,linked_at) VALUES($1,$2,$3)',
    [who, id, globalThis.notificationTest.time],
  );
}

test('subscription endpoint persists toggle, enforces free limit and blocks anonymous access', async () => {
  await link(userA);
  for (const id of [21, 22, 23])
    assert.equal(
      (
        await post(telegram, userA, {
          action: 'subscribe',
          anime_id: id,
          title: 'Anime',
        })
      ).status,
      200,
    );
  assert.equal(
    (
      await post(telegram, userA, {
        action: 'subscribe',
        anime_id: 24,
        title: 'Anime',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await post(telegram, userA, {
        action: 'subscribe',
        anime_id: 21,
        title: 'Anime',
      })
    ).status,
    200,
  );
  assert.equal((await rows('SELECT * FROM telegram_subscriptions')).length, 3);
  assert.equal(
    (
      await post(telegram, userA, {
        action: 'unsubscribe',
        anime_id: 21,
        title: 'Anime',
      })
    ).status,
    200,
  );
  assert.equal((await rows('SELECT * FROM telegram_subscriptions')).length, 2);
  assert.equal(
    (await telegram.GET(new Request('https://animonster.su/api/telegram')))
      .status,
    401,
  );
});
test('new episodes create durable jobs once and honor free availability time', async () => {
  await subscribe(userA);
  const due = globalThis.notificationTest.time + 3600000;
  const access = new Map([
    [7, { firstSeenAt: globalThis.notificationTest.time, freeAt: due }],
  ]);
  assert.equal(await queueEpisodeNotifications(21, [7], access), 1);
  assert.equal(await queueEpisodeNotifications(21, [7], access), 0);
  const [job] = await rows('SELECT * FROM telegram_deliveries');
  assert.equal(Number(job.available_at), due);
  assert.equal(Number(job.next_attempt_at), due);
});
test('worker sends due jobs with title and episode URL, records sent, and does not resend', async (t) => {
  await subscribe(userA);
  await link(userA);
  await queueEpisodeNotifications(21, [7], new Map());
  const sent = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.match(String(url), /api\.telegram\.org.*sendMessage/);
    sent.push(JSON.parse(options.body));
    return Response.json({ ok: true, result: { message_id: 1 } });
  });
  assert.equal((await runPlusWorker()).sent, 1);
  assert.equal((await runPlusWorker()).sent, 0);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].chat_id, 12345);
  assert.match(sent[0].text, /серия 7/);
  assert.match(sent[0].text, /anime\/21\?episode=7/);
  assert.equal(
    (await rows('SELECT status FROM telegram_deliveries'))[0].status,
    'sent',
  );
});
test('worker retries temporary Telegram failure and disables blocked accounts', async (t) => {
  await subscribe(userA);
  await link(userA);
  await queueEpisodeNotifications(21, [7], new Map());
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('', { status: 500 }),
  );
  assert.equal((await runPlusWorker()).failed, 1);
  let [job] = await rows('SELECT * FROM telegram_deliveries');
  assert.equal(job.status, 'retry');
  assert.equal(Number(job.attempts), 1);
  assert.ok(Number(job.next_attempt_at) > globalThis.notificationTest.time);
  globalThis.notificationTest.time = Number(job.next_attempt_at);
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('', { status: 403 }),
  );
  assert.equal((await runPlusWorker()).failed, 1);
  [job] = await rows('SELECT * FROM telegram_deliveries');
  assert.equal(job.status, 'disabled');
  assert.ok(
    (await rows('SELECT disabled_at FROM telegram_accounts'))[0].disabled_at,
  );
});
test('future jobs and unsubscribed titles are not sent', async (t) => {
  await subscribe(userA);
  await link(userA);
  const due = globalThis.notificationTest.time + 3600000;
  await queueEpisodeNotifications(
    21,
    [7],
    new Map([
      [7, { firstSeenAt: globalThis.notificationTest.time, freeAt: due }],
    ]),
  );
  t.mock.method(globalThis, 'fetch', async () => {
    assert.fail('Must not send yet');
  });
  assert.equal((await runPlusWorker()).sent, 0);
  globalThis.notificationTest.time = due;
  await engine.query('DELETE FROM telegram_subscriptions');
  assert.equal((await runPlusWorker()).sent, 0);
});
test('reply creates an unread site notification only for recipient; seen is isolated', async () => {
  let response = await post(community, userA, {
    action: 'comment',
    scope: 'anime:21',
    body: 'Первый комментарий',
  });
  assert.equal(response.status, 200);
  const parent = (await response.json()).id;
  response = await post(community, userB, {
    action: 'comment',
    scope: 'anime:21',
    parent_id: parent,
    body: 'Ответ',
  });
  assert.equal(response.status, 200);
  const get = (who) =>
    community.GET(
      new Request('https://animonster.su/api/community?action=notifications', {
        headers: { 'x-test-user': who },
      }),
    );
  const incoming = await (await get(userA)).json();
  assert.equal(incoming.length, 1);
  assert.equal(incoming[0].seen, 0);
  assert.equal((await (await get(userB)).json()).length, 0);
  assert.equal((await post(community, userA, { action: 'seen' })).status, 200);
  assert.equal((await (await get(userA)).json())[0].seen, 1);
});
test('diagnostic: a job left sending by process interruption is not recovered by later runs', async (t) => {
  await subscribe(userA);
  await link(userA);
  await queueEpisodeNotifications(21, [7], new Map());
  await engine.exec("UPDATE telegram_deliveries SET status='sending'");
  globalThis.notificationTest.time += 86400000;
  t.mock.method(globalThis, 'fetch', async () => {
    assert.fail('Current worker excludes sending jobs');
  });
  assert.equal((await runPlusWorker()).sent, 0);
  assert.equal(
    (await rows('SELECT status FROM telegram_deliveries'))[0].status,
    'sending',
  );
});
