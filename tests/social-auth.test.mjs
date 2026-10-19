import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';

const url = (source) =>
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
async function load(path, replacements = {}) {
  let text = stripTypeScriptTypes(await readFile(path, 'utf8'));
  for (const [key, value] of Object.entries(replacements))
    text = text.replaceAll(`'${key}'`, JSON.stringify(value));
  return url(text);
}
const engine = new PGlite({ extensions: { pg_trgm } });
for (const file of (await readdir('migrations/postgres'))
  .filter((file) => file.endsWith('.sql'))
  .sort())
  await engine.exec(await readFile('migrations/postgres/' + file, 'utf8'));
function adapter(connection) {
  return {
    prepare(text) {
      let index = 0,
        values = [];
      const query = text.replace(/\?/g, () => '$' + ++index);
      const execute = (target = connection) => target.query(query, values);
      return {
        bind(...args) {
          values = args;
          return this;
        },
        run: () => execute(),
        execute,
        async first() {
          return (await execute()).rows[0] || null;
        },
        async all() {
          return { results: (await execute()).rows };
        },
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
const env = {
  SITE_URL: 'http://localhost:3000',
  GOOGLE_CLIENT_ID: 'google-test-client',
  GOOGLE_CLIENT_SECRET: 'test-only-google-secret',
  TELEGRAM_LOGIN_CLIENT_ID: '123456789',
  TELEGRAM_LOGIN_CLIENT_SECRET: 'test-only-telegram-secret',
  TELEGRAM_WEBHOOK_SECRET: 'test-only-webhook-secret-more-than-24',
  TELEGRAM_BOT_TOKEN: 'test-bot-token',
  INVITE_REQUIRED: 'false',
};
globalThis.__socialTest = {
  database: adapter(engine),
  env,
  time: Date.now(),
  referrals: [],
};
const original = await readFile('lib/server/core.ts', 'utf8');
const helpers = original.slice(
  original.indexOf('export const now ='),
  original.indexOf('export type User ='),
);
const coreUrl =
  url(`export const db=()=>globalThis.__socialTest.database;export const runtime=()=>globalThis.__socialTest.env;
${stripTypeScriptTypes(helpers, { mode: 'transform' }).replace('Date.now()', 'globalThis.__socialTest.time')}
export async function requireUser(r){const token=cookie(r,'am_session');const u=await db().prepare('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.hash=? AND s.expires>?').bind(await hash(token),now()).first();if(!u)throw new ApiError('Login required',401,'authentication_required');return u;}`);
const { hash, uid } = await import(coreUrl);
const pureUrl = await load('lib/social-auth.ts');
const accountsUrl = await load('lib/server/social-accounts.ts', {
  './core': coreUrl,
  '@/lib/social-auth': pureUrl,
});
const accounts = await import(accountsUrl);
const authUrl = await load('lib/server/social-auth.ts', {
  jose: import.meta.resolve('jose'),
  './core': coreUrl,
  './social-accounts': accountsUrl,
  '@/lib/social-auth': pureUrl,
  './referrals': url(
    'export const attachReferralForNewUser=async(r,id)=>globalThis.__socialTest.referrals.push(id);',
  ),
});
const auth = await import(authUrl);
const webhook = await import(
  await load('app/api/telegram/webhook/route.ts', {
    '@/lib/server/core': coreUrl,
    '@/lib/server/social-accounts': accountsUrl,
  })
);
const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk = {
  ...(await exportJWK(publicKey)),
  kid: 'social-test-key',
  alg: 'RS256',
};
const keys = createLocalJWKSet({ keys: [jwk] });
async function token(provider, nonce, extra = {}) {
  const claims = {
    nonce,
    name: 'Test Monster',
    ...(provider === 'google'
      ? { email: 'new@example.com', email_verified: true }
      : { id: 987654321 }),
    ...extra,
  };
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
    .setSubject(extra.sub || provider + '-subject')
    .setIssuer(
      provider === 'google'
        ? 'https://accounts.google.com'
        : 'https://oauth.telegram.org',
    )
    .setAudience(
      provider === 'google'
        ? env.GOOGLE_CLIENT_ID
        : env.TELEGRAM_LOGIN_CLIENT_ID,
    )
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
}
const request = (path, options = {}) =>
  new Request('http://localhost:3000' + path, {
    headers: {
      Origin: 'http://localhost:3000',
      'x-real-ip': '192.0.2.1',
      ...options.headers,
    },
    ...options,
  });
const noLink = {
  userId: null,
  sessionHash: null,
  inviteHash: null,
  inviteRequired: false,
};
const identity = (subject, extra = {}) => ({
  provider: 'google',
  subject,
  name: 'NewMonster',
  email: subject + '@example.com',
  telegramId: null,
  ...extra,
});
async function user(label, extra = {}) {
  const id = uid();
  await engine.query(
    'INSERT INTO users(id,identity,nick,email,email_verified,role,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [
      id,
      'test:' + id,
      label + '_' + id.slice(0, 8),
      extra.email || null,
      extra.verified || 0,
      extra.role || 'user',
      Date.now(),
    ],
  );
  return id;
}
async function session(id) {
  const value = uid() + uid();
  await engine.query(
    'INSERT INTO sessions(hash,user_id,expires) VALUES($1,$2,$3)',
    [await hash(value), id, Date.now() + 600000],
  );
  return value;
}
async function start(provider = 'google', options = {}) {
  const response = await auth.startSocialAuth(
    request('/api/auth/' + provider, options),
    provider,
  );
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get('Location'));
  const browser = /am_oauth_\w+=([^;]+)/.exec(
    response.headers.get('Set-Cookie'),
  )?.[1];
  const state = location.searchParams.get('state');
  const flow = (
    await engine.query('SELECT * FROM auth_flows WHERE state=$1', [state])
  ).rows[0];
  return { response, location, browser, state, flow };
}
function callback(flow, provider = 'google', options = {}) {
  return request(
    `/api/auth/${provider}/callback?state=${flow.state}&code=${options.code || 'test-code'}`,
    {
      headers: {
        Cookie:
          `am_oauth_${provider}=${flow.browser}` +
          (options.session ? '; am_session=' + options.session : ''),
      },
    },
  );
}
function transport(t, flow, provider = 'google', claims = {}) {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    const endpoint = String(input);
    if (endpoint.includes('certs') || endpoint.includes('jwks.json'))
      return Response.json({ keys: [jwk] });
    assert.equal(
      endpoint,
      provider === 'google'
        ? 'https://oauth2.googleapis.com/token'
        : 'https://oauth.telegram.org/token',
    );
    const form = new URLSearchParams(options.body);
    assert.equal(form.get('code_verifier'), flow.flow.verifier);
    assert.equal(
      form.get('redirect_uri'),
      `http://localhost:3000/api/auth/${provider}/callback`,
    );
    if (provider === 'telegram')
      assert.ok(options.headers.Authorization.startsWith('Basic '));
    else assert.equal(form.get('client_secret'), env.GOOGLE_CLIENT_SECRET);
    calls++;
    return Response.json({
      id_token: await token(provider, flow.flow.nonce, claims),
      access_token: 'must-never-persist',
    });
  });
  return () => calls;
}

await test('migration preserves existing VK flow defaults and does not modify users', async () => {
  await engine.query(
    'INSERT INTO auth_flows(state,browser_hash,verifier,expires) VALUES($1,$2,$3,$4)',
    ['old-vk', 'browser', 'plain-pkce-verifier', Date.now() + 600000],
  );
  const flow = (
    await engine.query("SELECT * FROM auth_flows WHERE state='old-vk'")
  ).rows[0];
  assert.equal(flow.provider, 'vk');
  assert.equal(flow.verifier, 'plain-pkce-verifier');
});
await test('both providers validate signed ID tokens including Telegram subject versus numeric ID', async () => {
  for (const provider of ['google', 'telegram']) {
    const result = await auth.verifySocialToken(
      provider,
      await token(provider, 'nonce'),
      'nonce',
      provider === 'google'
        ? env.GOOGLE_CLIENT_ID
        : env.TELEGRAM_LOGIN_CLIENT_ID,
      keys,
    );
    assert.equal(result.subject, provider + '-subject');
    if (provider === 'google') assert.equal(result.email, 'new@example.com');
    else assert.equal(result.telegramId, '987654321');
  }
});
await test('wrong nonce, issuer, audience, expiry, unsigned tokens and unverified emails cannot authenticate', async () => {
  const valid = await token('google', 'nonce');
  await assert.rejects(() =>
    auth.verifySocialToken(
      'google',
      valid,
      'wrong',
      env.GOOGLE_CLIENT_ID,
      keys,
    ),
  );
  await assert.rejects(() =>
    auth.verifySocialToken(
      'telegram',
      valid,
      'nonce',
      env.TELEGRAM_LOGIN_CLIENT_ID,
      keys,
    ),
  );
  await assert.rejects(() =>
    auth.verifySocialToken('google', valid, 'nonce', 'other-client', keys),
  );
  for (const claims of [
    { email_verified: false },
    { email: null },
    { azp: 'another-client' },
    { nonce: null },
  ])
    await assert.rejects(async () =>
      auth.verifySocialToken(
        'google',
        await token('google', 'nonce', claims),
        'nonce',
        env.GOOGLE_CLIENT_ID,
        keys,
      ),
    );
  const expired = await new SignJWT({
    nonce: 'nonce',
    email: 'x@example.com',
    email_verified: true,
  })
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
    .setIssuer('https://accounts.google.com')
    .setAudience(env.GOOGLE_CLIENT_ID)
    .setSubject('expired')
    .setIssuedAt(Math.floor(Date.now() / 1000) - 4000)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 100)
    .sign(privateKey);
  await assert.rejects(() =>
    auth.verifySocialToken(
      'google',
      expired,
      'nonce',
      env.GOOGLE_CLIENT_ID,
      keys,
    ),
  );
  await assert.rejects(() =>
    auth.verifySocialToken(
      'google',
      'eyJhbGciOiJub25lIn0.e30.',
      'nonce',
      env.GOOGLE_CLIENT_ID,
      keys,
    ),
  );
  await assert.rejects(async () =>
    auth.verifySocialToken(
      'telegram',
      await token('telegram', 'nonce', { id: -1 }),
      'nonce',
      env.TELEGRAM_LOGIN_CLIENT_ID,
      keys,
    ),
  );
});
await test('new Google account is created once, gets normal role and keeps the same identity on concurrent sign-ins', async () => {
  const profile = identity('parallel-google');
  const results = await Promise.all([
    accounts.socialAccount(profile, noLink),
    accounts.socialAccount(profile, noLink),
  ]);
  assert.equal(results[0].id, results[1].id);
  assert.equal(results.filter((item) => item.created).length, 1);
  const row = (
    await engine.query('SELECT * FROM users WHERE id=$1', [results[0].id])
  ).rows[0];
  assert.equal(row.role, 'user');
  assert.equal(row.email_verified, 1);
});
await test('an existing email is never silently merged, even when verified by Google', async () => {
  const existing = await user('EmailOwner', {
    email: 'already@example.com',
    verified: 1,
  });
  await assert.rejects(
    () =>
      accounts.socialAccount(
        identity('new-sub', { email: 'already@example.com' }),
        noLink,
      ),
    { code: 'social_email_exists' },
  );
  assert.equal(
    (
      await engine.query(
        'SELECT count(*)::int AS n FROM auth_identities WHERE user_id=$1',
        [existing],
      )
    ).rows[0].n,
    0,
  );
});
await test('explicit linking needs the original active session and preserves profile, email, role and collections', async () => {
  const id = await user('LinkOwner', {
      email: 'link@example.com',
      verified: 1,
      role: 'moderator',
    }),
    active = await session(id),
    hashValue = await hash(active);
  await engine.query(
    "INSERT INTO collection(user_id,anime_id,title,image) VALUES($1,16498,'Attack on Titan','/poster.jpg')",
    [id],
  );
  const options = { ...noLink, userId: id, sessionHash: hashValue };
  const result = await accounts.socialAccount(
    identity('linked-google', { email: 'link@example.com' }),
    options,
  );
  assert.equal(result.id, id);
  assert.equal(result.created, false);
  const row = (
    await engine.query('SELECT role,email FROM users WHERE id=$1', [id])
  ).rows[0];
  assert.equal(row.role, 'moderator');
  assert.equal(row.email, 'link@example.com');
  assert.equal(
    (
      await engine.query(
        'SELECT count(*)::int AS n FROM collection WHERE user_id=$1',
        [id],
      )
    ).rows[0].n,
    1,
  );
  await assert.rejects(
    () =>
      accounts.socialAccount(
        identity('other-sub', { email: 'other@example.com' }),
        { ...options, sessionHash: 'wrong' },
      ),
    { code: 'social_session_expired' },
  );
  await assert.rejects(
    () =>
      accounts.socialAccount(
        identity('second-sub', { email: 'link@example.com' }),
        options,
      ),
    { code: 'social_conflict' },
  );
});
await test('Telegram notification binding opens the existing account without a duplicate or new notification permission', async () => {
  const id = await user('TelegramOwner');
  await engine.query(
    'INSERT INTO telegram_accounts(user_id,telegram_id) VALUES($1,$2)',
    [id, 111222333],
  );
  const result = await accounts.socialAccount(
    identity('tg-opaque-sub', {
      provider: 'telegram',
      email: null,
      telegramId: '111222333',
    }),
    { ...noLink, inviteRequired: true },
  );
  assert.equal(result.id, id);
  assert.equal(result.created, false);
  const fresh = await accounts.socialAccount(
    identity('tg-fresh', {
      provider: 'telegram',
      email: null,
      telegramId: '111222334',
    }),
    noLink,
  );
  assert.equal(
    (
      await engine.query(
        'SELECT count(*)::int AS n FROM telegram_accounts WHERE user_id=$1',
        [fresh.id],
      )
    ).rows[0].n,
    0,
  );
});
await test('a provider identity cannot be linked to another account, and suspended or deleted users stay blocked', async () => {
  const profile = identity('blocked-test'),
    linked = await accounts.socialAccount(profile, noLink),
    other = await user('OtherUser'),
    active = await session(other);
  await assert.rejects(
    async () =>
      accounts.socialAccount(profile, {
        ...noLink,
        userId: other,
        sessionHash: await hash(active),
      }),
    { code: 'social_conflict' },
  );
  await engine.query('UPDATE users SET suspended_until=$1 WHERE id=$2', [
    Date.now() + 600000,
    linked.id,
  ]);
  await assert.rejects(() => accounts.socialAccount(profile, noLink), {
    code: 'social_blocked',
  });
  await engine.query(
    'UPDATE users SET suspended_until=NULL,deleted_at=$1 WHERE id=$2',
    [Date.now(), linked.id],
  );
  await assert.rejects(() => accounts.socialAccount(profile, noLink), {
    code: 'social_blocked',
  });
});
await test('invitations apply only to registration and cannot be spent twice or consumed on failed linking', async () => {
  await assert.rejects(
    () =>
      accounts.socialAccount(identity('needs-invite'), {
        ...noLink,
        inviteRequired: true,
      }),
    { code: 'social_invite_required' },
  );
  const owner = await user('InviteOwner'),
    inviteHash = await hash('AM-VALID-INVITE');
  await engine.query(
    'INSERT INTO invites(hash,created_by,created_at) VALUES($1,$2,$3)',
    [inviteHash, owner, Date.now()],
  );
  const results = await Promise.allSettled(
    ['invited-a', 'invited-b'].map((subject) =>
      accounts.socialAccount(identity(subject), {
        ...noLink,
        inviteRequired: true,
        inviteHash,
      }),
    ),
  );
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
  const success = results.find((item) => item.status === 'fulfilled').value;
  const subject = results[0].status === 'fulfilled' ? 'invited-a' : 'invited-b';
  assert.equal(
    (
      await accounts.socialAccount(identity(subject), {
        ...noLink,
        inviteRequired: true,
      })
    ).id,
    success.id,
  );
});
await test('authorization URLs use provider-specific state, browser binding, nonce, PKCE and minimum scopes', async () => {
  for (const provider of ['google', 'telegram']) {
    const flow = await start(provider);
    assert.ok(flow.browser);
    assert.equal(flow.flow.provider, provider);
    assert.equal(flow.flow.browser_hash, await hash(flow.browser));
    assert.equal(flow.location.searchParams.get('nonce'), flow.flow.nonce);
    assert.equal(
      flow.location.searchParams.get('code_challenge_method'),
      'S256',
    );
    assert.equal(
      flow.location.searchParams.get('code_challenge'),
      Buffer.from(
        await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(flow.flow.verifier),
        ),
      ).toString('base64url'),
    );
    assert.ok(!flow.location.searchParams.get('scope').includes('phone'));
    assert.ok(!flow.location.searchParams.get('scope').includes('bot_access'));
    assert.match(
      flow.response.headers.get('Set-Cookie'),
      /HttpOnly; SameSite=Lax/,
    );
  }
});
await test('Google callback verifies code and token, creates a session, and rejects replay', async (t) => {
  const flow = await start();
  const calls = transport(t, flow, 'google', { email: 'callback@example.com' });
  const response = await auth.finishSocialAuth(callback(flow), 'google');
  assert.equal(
    new URL(response.headers.get('Location')).searchParams.get('auth'),
    'social_signed_in',
  );
  assert.match(response.headers.get('Set-Cookie'), /am_session=/);
  assert.match(
    response.headers.get('Set-Cookie'),
    /am_oauth_google=;.*Max-Age=0/,
  );
  const replay = await auth.finishSocialAuth(callback(flow), 'google');
  assert.equal(
    new URL(replay.headers.get('Location')).searchParams.get('auth'),
    'social_expired',
  );
  assert.equal(calls(), 1);
  assert.equal(
    (
      await engine.query(
        'SELECT count(*)::int AS n FROM sessions WHERE user_id=(SELECT user_id FROM auth_identities WHERE provider=$1 AND provider_user_id=$2)',
        ['google', 'google-subject'],
      )
    ).rows[0].n,
    1,
  );
});
await test('wrong browser, wrong provider and missing or expired state never exchange tokens', async (t) => {
  const flow = await start();
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    throw new Error('must not fetch');
  });
  const wrong = { ...flow, browser: 'wrong-browser' };
  assert.equal(
    new URL(
      (await auth.finishSocialAuth(callback(wrong), 'google')).headers.get(
        'Location',
      ),
    ).searchParams.get('auth'),
    'social_expired',
  );
  assert.equal(
    new URL(
      (
        await auth.finishSocialAuth(callback(flow, 'telegram'), 'telegram')
      ).headers.get('Location'),
    ).searchParams.get('auth'),
    'social_expired',
  );
  await engine.query('UPDATE auth_flows SET expires=0 WHERE state=$1', [
    flow.state,
  ]);
  assert.equal(
    new URL(
      (await auth.finishSocialAuth(callback(flow), 'google')).headers.get(
        'Location',
      ),
    ).searchParams.get('auth'),
    'social_expired',
  );
  assert.equal(calls, 0);
});
await test('link callback is tied to the original login session and does not replace its cookie', async (t) => {
  const id = await user('CallbackLink'),
    active = await session(id);
  const flow = await start('google', {
    method: 'POST',
    headers: {
      Origin: 'http://localhost:3000',
      Cookie: 'am_session=' + active,
    },
  });
  transport(t, flow, 'google', {
    email: 'callback-link@example.com',
    sub: 'link-callback-subject',
  });
  const linked = await auth.finishSocialAuth(
    callback(flow, 'google', { session: active }),
    'google',
  );
  assert.equal(
    new URL(linked.headers.get('Location')).searchParams.get('auth'),
    'social_linked',
  );
  assert.ok(!linked.headers.get('Set-Cookie').includes('am_session='));
  const flow2 = await start('telegram', {
    method: 'POST',
    headers: {
      Origin: 'http://localhost:3000',
      Cookie: 'am_session=' + active,
    },
  });
  const bad = await auth.finishSocialAuth(
    callback(flow2, 'telegram', { session: 'other-session' }),
    'telegram',
  );
  assert.equal(
    new URL(bad.headers.get('Location')).searchParams.get('auth'),
    'social_session_expired',
  );
});
await test('cross-site linking, cancelled consent, disabled providers and token failures are handled without login', async (t) => {
  const cross = await auth.startSocialAuth(
    request('/api/auth/google', {
      method: 'POST',
      headers: { Origin: 'https://evil.example' },
    }),
    'google',
  );
  assert.equal(cross.status, 403);
  const flow = await start();
  const cancelled = await auth.finishSocialAuth(
    request(
      `/api/auth/google/callback?state=${flow.state}&error=access_denied`,
      { headers: { Cookie: 'am_oauth_google=' + flow.browser } },
    ),
    'google',
  );
  assert.equal(
    new URL(cancelled.headers.get('Location')).searchParams.get('auth'),
    'social_cancelled',
  );
  const bad = await start();
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('', { status: 503 }),
  );
  const failed = await auth.finishSocialAuth(callback(bad), 'google');
  assert.equal(
    new URL(failed.headers.get('Location')).searchParams.get('auth'),
    'social_failed',
  );
  assert.ok(!failed.headers.get('Set-Cookie').includes('am_session='));
  const secret = env.GOOGLE_CLIENT_SECRET;
  env.GOOGLE_CLIENT_SECRET = '';
  assert.equal(auth.socialReady('google'), false);
  const unavailable = await auth.startSocialAuth(
    request('/api/auth/google'),
    'google',
  );
  assert.equal(
    new URL(unavailable.headers.get('Location')).searchParams.get('auth'),
    'social_unavailable',
  );
  env.GOOGLE_CLIENT_SECRET = secret;
});
await test('Telegram webhook accepts private verified sender only and cannot rebind another account login', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ok: true }));
  const owner = await user('WebhookOwner'),
    other = await user('WebhookOther'),
    linkToken = 'test-link-token-12345678901234567890';
  await accounts.socialAccount(
    identity('webhook-tg', {
      provider: 'telegram',
      email: null,
      telegramId: '555666777',
    }),
    { ...noLink, userId: owner, sessionHash: await hash(await session(owner)) },
  );
  await engine.query(
    'INSERT INTO telegram_accounts(user_id,link_token_hash,link_expires_at) VALUES($1,$2,$3)',
    [other, await hash(linkToken), Date.now() + 600000],
  );
  const update = (type = 'private') =>
    new Request('http://localhost:3000/api/telegram/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': env.TELEGRAM_WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        message: {
          text: '/start ' + linkToken,
          chat: { id: 555666777, type },
          from: { id: 555666777, username: 'test' },
        },
      }),
    });
  assert.equal((await webhook.POST(update('group'))).status, 200);
  assert.equal((await webhook.POST(update())).status, 409);
  assert.equal(
    (
      await engine.query(
        'SELECT telegram_id FROM telegram_accounts WHERE user_id=$1',
        [other],
      )
    ).rows[0].telegram_id,
    null,
  );
});

await test('Telegram code callback uses its own issuer and client, reuses notifications owner and creates a login session', async (t) => {
  const owner = await user('TgCallbackOwner');
  await engine.query(
    'INSERT INTO telegram_accounts(user_id,telegram_id) VALUES($1,$2)',
    [owner, 987654321],
  );
  const flow = await start('telegram');
  transport(t, flow, 'telegram');
  const response = await auth.finishSocialAuth(
    callback(flow, 'telegram'),
    'telegram',
  );
  assert.equal(
    new URL(response.headers.get('Location')).searchParams.get('auth'),
    'social_signed_in',
  );
  const login = /am_session=([^;]+)/.exec(
    response.headers.get('Set-Cookie'),
  )?.[1];
  assert.ok(login);
  assert.equal(
    (
      await engine.query('SELECT user_id FROM sessions WHERE hash=$1', [
        await hash(login),
      ])
    ).rows[0].user_id,
    owner,
  );
  assert.equal(
    (
      await engine.query(
        "SELECT provider_account_id FROM auth_identities WHERE provider='telegram' AND user_id=$1",
        [owner],
      )
    ).rows[0].provider_account_id,
    '987654321',
  );
});
await test('production OAuth cookies are Secure and callback URLs come from the configured site, not supplied headers', async () => {
  const previous = env.SITE_URL;
  env.SITE_URL = 'https://animonster.su';
  try {
    const flow = await start('google', {
      headers: { host: 'evil.example', 'x-forwarded-host': 'evil.example' },
    });
    assert.match(flow.response.headers.get('Set-Cookie'), /; Secure/);
    assert.equal(
      flow.location.searchParams.get('redirect_uri'),
      'https://animonster.su/api/auth/google/callback',
    );
  } finally {
    env.SITE_URL = previous;
  }
});
await test('OAuth attempt limits are shared by IP in PostgreSQL and recover after expiry', async () => {
  const req = () =>
    request('/api/auth/google', { headers: { 'x-real-ip': '192.0.2.200' } });
  for (let i = 0; i < 40; i++)
    assert.equal(
      new URL(
        (await auth.startSocialAuth(req(), 'google')).headers.get('Location'),
      ).hostname,
      'accounts.google.com',
    );
  const rejected = await auth.startSocialAuth(req(), 'google');
  assert.equal(
    new URL(rejected.headers.get('Location')).searchParams.get('auth'),
    'social_limited',
  );
  await engine.query('UPDATE auth_limits SET expires=0 WHERE key=$1', [
    'social-auth:' + (await hash('192.0.2.200')),
  ]);
  assert.equal(
    new URL(
      (await auth.startSocialAuth(req(), 'google')).headers.get('Location'),
    ).hostname,
    'accounts.google.com',
  );
});
await engine.close();
delete globalThis.__socialTest;
