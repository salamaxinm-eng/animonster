import assert from 'node:assert/strict';
import { test, beforeEach, after } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
const url = (s) =>
  'data:text/javascript;base64,' + Buffer.from(s).toString('base64');
async function moduleUrl(path, replacements = {}) {
  let source = stripTypeScriptTypes(await readFile(path, 'utf8'), {
    mode: 'transform',
  });
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
      const sql = source.replace(/\?/g, () => '$' + ++n),
        execute = (target = connection) => target.query(sql, values);
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
          return { meta: { changes: (await execute()).affectedRows || 0 } };
        },
        execute,
      };
    },
    transaction: (callback) =>
      connection.transaction((tx) => callback(adapter(tx))),
    batch: (statements) =>
      connection.transaction(async (tx) => {
        for (const statement of statements) await statement.execute(tx);
      }),
  };
}
const state = {
  time: 1800000000000,
  db: adapter(engine),
  env: {
    VK_BOT_ENABLED: 'true',
    VK_BOT_GROUP_ID: '241950462',
    VK_BOT_TOKEN: 'test-secret-token',
    VK_BOT_SECRET: 'test-webhook-secret-24-characters',
    VK_BOT_CONFIRMATION: 'confirm-code',
    SITE_URL: 'https://animonster.su',
  },
};
globalThis.vkNotificationTest = state;
const core = url(`
export const db=()=>globalThis.vkNotificationTest.db,now=()=>globalThis.vkNotificationTest.time,runtime=()=>globalThis.vkNotificationTest.env;
export class ApiError extends Error{constructor(message,status=400){super(message);this.status=status}}
export const fail=e=>Response.json({error:e.message},{status:e.status||500}),json=v=>Response.json(v),body=r=>r.json();
export const hash=async s=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))).toString('hex');
export const sameOrigin=r=>{if(r.headers.get('origin')!==new URL(r.url).origin)throw new ApiError('Origin rejected',403)};
export const requireUser=async r=>{const id=r.headers.get('x-test-user');const u=id&&await db().prepare('SELECT * FROM users WHERE id=?').bind(id).first();if(!u)throw new ApiError('Login required',401);return u};
export const premium=async id=>(await db().prepare('SELECT CASE WHEN bool_or(lifetime) THEN 253402300799000 ELSE max(expires) END AS expires FROM grants WHERE user_id=? AND revoked_at IS NULL').bind(id).first())?.expires||0;
`);
const serviceUrl = await moduleUrl('lib/server/vk-notifications.ts', {
  './core': core,
});
const service = await import(serviceUrl);
const route = await import(
  await moduleUrl('app/api/vk-notifications/route.ts', {
    '@/lib/server/core': core,
    '@/lib/server/vk-notifications': serviceUrl,
  })
);
const callback = await import(
  await moduleUrl('app/api/vk-notifications/callback/route.ts', {
    '@/lib/server/core': core,
    '@/lib/server/vk-notifications': serviceUrl,
  })
);
const connect = await import(
  await moduleUrl('app/api/vk-notifications/connect/route.ts', {
    '@/lib/server/core': core,
    '@/lib/server/vk-notifications': serviceUrl,
  })
);
const a = '11111111-1111-4111-8111-111111111111',
  b = '22222222-2222-4222-8222-222222222222';
const query = (s, v = []) => engine.query(s, v);
const rows = async (s, v = []) => (await query(s, v)).rows;
const post = (data, who = a, origin = 'https://animonster.su') =>
  route.POST(
    new Request('https://animonster.su/api/vk-notifications', {
      method: 'POST',
      headers: {
        origin,
        'content-type': 'application/json',
        ...(who ? { 'x-test-user': who } : {}),
      },
      body: JSON.stringify(data),
    }),
  );
const event = (type, object, id = crypto.randomUUID()) => ({
  type,
  object,
  event_id: id,
  group_id: 241950462,
  secret: state.env.VK_BOT_SECRET,
});
const receive = (data) =>
  callback.POST(
    new Request('https://animonster.su/api/vk-notifications/callback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    }),
  );
const incoming = (text, person = 123) =>
  event('message_new', {
    message: { from_id: person, peer_id: person, text, out: 0 },
  });
function transport(t, sendResult = 41) {
  const sent = [];
  t.mock.method(globalThis, 'fetch', async (endpoint, options) => {
    assert.match(String(endpoint), /^https:\/\/api\.vk\.com\/method\//);
    const form = new URLSearchParams(options.body);
    assert.equal(form.get('access_token'), 'test-secret-token');
    if (String(endpoint).endsWith('messages.isMessagesFromGroupAllowed'))
      return Response.json({ response: { is_allowed: 1 } });
    assert.ok(String(endpoint).endsWith('messages.send'));
    sent.push(Object.fromEntries(form));
    return Response.json(
      typeof sendResult === 'object' ? sendResult : { response: sendResult },
    );
  });
  return sent;
}
async function link(who = a, person = 123) {
  await query(
    'INSERT INTO vk_bot_accounts(user_id,vk_user_id,linked_at) VALUES($1,$2,$3)',
    [who, person, state.time],
  );
}
async function subscribe(who = a, anime = 21) {
  await query('INSERT INTO vk_bot_subscriptions VALUES($1,$2,$3,$4)', [
    who,
    anime,
    'Тайтл ' + anime,
    state.time,
  ]);
}
async function episode(anime = 21, ordinal = 2, free = state.time) {
  await query('INSERT INTO anime_episode_availability VALUES($1,$2,$3,$4)', [
    anime,
    ordinal,
    state.time + 1,
    free,
  ]);
}
beforeEach(async () => {
  state.time = 1800000000000;
  state.env.VK_BOT_ENABLED = 'true';
  state.db = adapter(engine);
  await engine.exec(
    'TRUNCATE users CASCADE; DELETE FROM anime_cache; DELETE FROM anime_episode_availability; DELETE FROM vk_bot_events;',
  );
  for (const [id, nick] of [
    [a, 'A'],
    [b, 'B'],
  ])
    await query(
      'INSERT INTO users(id,identity,nick,created_at) VALUES($1,$2,$3,$4)',
      [id, 'test:' + id, nick, state.time],
    );
  for (const id of [21, 22, 23, 24])
    await query(
      "INSERT INTO anime_cache(id,data,episodes,updated_at) VALUES($1,$2,'[]',$3)",
      [id, JSON.stringify({ id, russian: 'Тайтл ' + id }), state.time],
    );
});
after(() => engine.close());
test('native connection form redirects directly to VK with an opaque ref and enforces login and origin', async () => {
  const request = (who = a, origin = 'https://animonster.su') =>
    new Request('https://animonster.su/api/vk-notifications/connect', {
      method: 'POST',
      headers: {
        origin,
        ...(who ? { 'x-test-user': who } : {}),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: '',
    });
  assert.equal((await connect.POST(request(null))).status, 401);
  assert.equal(
    (await connect.POST(request(a, 'https://evil.test'))).status,
    403,
  );
  const response = await connect.POST(request());
  assert.equal(response.status, 303);
  const target = new URL(response.headers.get('location'));
  assert.equal(target.origin, 'https://vk.ru');
  assert.equal(target.pathname, '/write-241950462');
  assert.match(target.searchParams.get('ref'), /^[A-Za-z0-9_-]{32}$/);
  assert.equal(target.searchParams.get('ref_source'), 'animonster_connect');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
});
test('a normal private message with the connection ref binds without typing the command', async (t) => {
  transport(t);
  const data = await (await post({ action: 'link' })).json();
  const ref = new URL(data.url).searchParams.get('ref');
  const value = incoming('Привет');
  value.object.message.ref = ref;
  assert.equal((await receive(value)).status, 200);
  assert.equal(
    Number(
      (await rows('SELECT vk_user_id FROM vk_bot_accounts'))[0].vk_user_id,
    ),
    123,
  );
  assert.equal((await rows('SELECT * FROM vk_bot_outbox')).length, 1);
  const replay = incoming('Ещё сообщение');
  replay.object.message.ref = ref;
  await receive(replay);
  assert.equal((await rows('SELECT * FROM vk_bot_outbox')).length, 1);
});
test('a permission event can bind its one-time key and malformed refs cannot bind', async (t) => {
  transport(t);
  const data = await (await post({ action: 'link' })).json();
  const ref = new URL(data.url).searchParams.get('ref');
  const bad = incoming('Привет');
  bad.object.message.ref = { token: ref };
  await receive(bad);
  assert.equal(
    (await rows('SELECT vk_user_id FROM vk_bot_accounts'))[0].vk_user_id,
    null,
  );
  await receive(event('message_allow', { user_id: 123, key: ref }));
  assert.equal(
    Number(
      (await rows('SELECT vk_user_id FROM vk_bot_accounts'))[0].vk_user_id,
    ),
    123,
  );
});
test('overlapping workers claim a queued message once', async (t) => {
  const sent = transport(t);
  await link();
  await subscribe();
  await episode();
  const results = await Promise.all([
    service.runVkNotifications(),
    service.runVkNotifications(),
  ]);
  assert.equal(
    results.reduce((sum, result) => sum + result.sent, 0),
    1,
  );
  assert.equal(sent.length, 1);
  assert.equal(
    (await rows('SELECT status FROM vk_bot_outbox'))[0].status,
    'sent',
  );
});
test('feature off does not touch VK tables; subscription API requires auth and same origin', async () => {
  assert.equal((await post({ action: 'link' }, null)).status, 401);
  assert.equal(
    (await post({ action: 'link' }, a, 'https://evil.test')).status,
    403,
  );
  state.env.VK_BOT_ENABLED = 'false';
  state.db = {
    prepare() {
      throw Error('Must not touch database');
    },
  };
  assert.deepEqual(await service.runVkNotifications(), {
    queued: 0,
    sent: 0,
    failed: 0,
  });
});
test('callback requires correct community and secret; confirmation returns plain text', async () => {
  const value = event('confirmation', {});
  assert.equal((await receive({ ...value, group_id: 1 })).status, 404);
  assert.equal((await receive({ ...value, secret: 'wrong' })).status, 404);
  const response = await receive(value);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/plain/);
  assert.equal(await response.text(), 'confirm-code');
});
test('one-time private command binds account, stores token hash, deduplicates event and queues welcome', async (t) => {
  const sent = transport(t);
  const linkData = await (await post({ action: 'link' })).json();
  const token = linkData.command.split(' ')[1];
  const [saved] = await rows('SELECT link_token_hash FROM vk_bot_accounts');
  assert.notEqual(saved.link_token_hash, token);
  const value = incoming(linkData.command);
  assert.equal((await receive(value)).status, 200);
  assert.equal((await receive(value)).status, 200);
  const [account] = await rows('SELECT * FROM vk_bot_accounts');
  assert.equal(Number(account.vk_user_id), 123);
  assert.equal(account.link_token_hash, null);
  assert.equal((await rows('SELECT * FROM vk_bot_outbox')).length, 1);
  assert.equal((await service.runVkNotifications()).sent, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].peer_id, '123');
  assert.match(sent[0].message, /ВК подключён/);
  assert.equal((await service.runVkNotifications()).sent, 0);
});
test('expired token, group chat, and conflicting existing VK identity cannot bind', async (t) => {
  transport(t);
  let data = await (await post({ action: 'link' })).json();
  const groupChat = incoming(data.command);
  groupChat.object.message.peer_id = 2000000001;
  await receive(groupChat);
  assert.equal(
    (await rows('SELECT vk_user_id FROM vk_bot_accounts'))[0].vk_user_id,
    null,
  );
  state.time += 16 * 60000;
  await receive(incoming(data.command));
  assert.equal(
    (await rows('SELECT vk_user_id FROM vk_bot_accounts'))[0].vk_user_id,
    null,
  );
  data = await (await post({ action: 'link' })).json();
  await query('UPDATE users SET identity=$1 WHERE id=$2', ['vk:123', b]);
  assert.equal((await receive(incoming(data.command))).status, 409);
  assert.equal(
    (await rows('SELECT vk_user_id FROM vk_bot_accounts'))[0].vk_user_id,
    null,
  );
});
test('subscription uses real catalogue title, requires linking, limits free users, and is idempotent', async () => {
  assert.equal((await post({ action: 'subscribe', anime_id: 21 })).status, 409);
  await link();
  assert.equal(
    (await post({ action: 'subscribe', anime_id: 9999 })).status,
    404,
  );
  for (const anime_id of [21, 22, 23])
    assert.equal(
      (await post({ action: 'subscribe', anime_id, title: 'spoofed' })).status,
      200,
    );
  assert.equal((await post({ action: 'subscribe', anime_id: 21 })).status, 200);
  assert.equal((await post({ action: 'subscribe', anime_id: 24 })).status, 403);
  assert.equal(
    (await rows('SELECT title FROM vk_bot_subscriptions WHERE anime_id=21'))[0]
      .title,
    'Тайтл 21',
  );
  await query(
    'INSERT INTO grants(order_id,user_id,starts_at,expires) VALUES($1,$2,$3,$4)',
    ['plus', a, state.time, state.time + 86400000],
  );
  assert.equal((await post({ action: 'subscribe', anime_id: 24 })).status, 200);
});
test('availability reconciliation respects free delay, Plus and deduplication across runs', async (t) => {
  const sent = transport(t);
  await link(a, 123);
  await link(b, 456);
  await subscribe(a);
  await subscribe(b);
  await query(
    'INSERT INTO grants(order_id,user_id,starts_at,expires) VALUES($1,$2,$3,$4)',
    ['plus', b, state.time, state.time + 86400000],
  );
  const due = state.time + 14400000;
  await episode(21, 2, due);
  let result = await service.runVkNotifications();
  assert.equal(result.queued, 2);
  assert.equal(result.sent, 1);
  assert.equal(sent[0].peer_id, '456');
  assert.equal((await service.runVkNotifications()).queued, 0);
  state.time = due;
  result = await service.runVkNotifications();
  assert.equal(result.sent, 1);
  assert.equal(sent[1].peer_id, '123');
  assert.match(sent[1].message, /anime\/21\?episode=2/);
});
test('worker recovers expired sending lease and preserves random_id on retry', async (t) => {
  let sent = transport(t, {
    error: {
      error_code: 6,
      request_params: [{ key: 'access_token', value: 'secret-must-not-leak' }],
    },
  });
  await link();
  await subscribe();
  await episode();
  await service.runVkNotifications();
  let [job] = await rows('SELECT * FROM vk_bot_outbox');
  assert.equal(job.status, 'retry');
  assert.doesNotMatch(job.last_error, /secret-must-not-leak/);
  const random = sent[0].random_id;
  await query(
    "UPDATE vk_bot_outbox SET status='sending',claimed_at=$1,lease_token='dead-worker' WHERE id=$2",
    [state.time - 600000, job.id],
  );
  sent = transport(t);
  assert.equal((await service.runVkNotifications()).sent, 1);
  assert.equal(sent[0].random_id, random);
  [job] = await rows('SELECT * FROM vk_bot_outbox');
  assert.equal(job.status, 'sent');
  assert.equal(job.lease_token, null);
});
test('VK error in HTTP 200 disables blocked recipient, and message_allow rechecks permission', async (t) => {
  transport(t, { error: { error_code: 901 } });
  await link();
  await subscribe();
  await episode();
  assert.equal((await service.runVkNotifications()).failed, 1);
  assert.ok(
    (await rows('SELECT disabled_at FROM vk_bot_accounts'))[0].disabled_at,
  );
  transport(t);
  await receive(event('message_allow', { user_id: 123 }));
  assert.equal(
    (await rows('SELECT disabled_at FROM vk_bot_accounts'))[0].disabled_at,
    null,
  );
  await receive(event('message_deny', { user_id: 123 }));
  assert.ok(
    (await rows('SELECT disabled_at FROM vk_bot_accounts'))[0].disabled_at,
  );
});
test('unsubscribe and disconnect cancel pending messages and invalidate link tokens', async (t) => {
  const sent = transport(t);
  await link();
  await subscribe();
  await episode(21, 2, state.time + 14400000);
  await service.runVkNotifications();
  assert.equal(
    (await post({ action: 'unsubscribe', anime_id: 21 })).status,
    200,
  );
  state.time += 14400000;
  assert.equal((await service.runVkNotifications()).sent, 0);
  assert.equal(sent.length, 0);
  const data = await (await post({ action: 'link' })).json();
  await post({ action: 'disconnect' });
  await receive(incoming(data.command));
  const [account] = await rows('SELECT * FROM vk_bot_accounts');
  assert.equal(account.vk_user_id, null);
  assert.equal(account.link_token_hash, null);
});
