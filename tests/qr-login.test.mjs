import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import sharp from 'sharp';
import jsQR from 'jsqr';

const url = (text) =>
  'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
async function load(path, replacements = {}) {
  let source = stripTypeScriptTypes(await readFile(path, 'utf8'));
  for (const [from, to] of Object.entries(replacements))
    source = source.replaceAll(`'${from}'`, JSON.stringify(to));
  return url(source);
}
function adapter(connection) {
  return {
    prepare(text) {
      let n = 0,
        values = [];
      const sql = text.replace(/\?/g, () => '$' + ++n),
        execute = () => connection.query(sql, values);
      return {
        bind(...v) {
          values = v;
          return this;
        },
        async first() {
          return (await execute()).rows[0] || null;
        },
        async all() {
          return { results: (await execute()).rows };
        },
        run: execute,
        executeWith(target) {
          return target.query(sql, values);
        },
      };
    },
    batch: (statements) =>
      connection.transaction((tx) =>
        Promise.all(statements.map((statement) => statement.executeWith(tx))),
      ),
    transaction: (fn) => connection.transaction((tx) => fn(adapter(tx))),
  };
}
const hash = (value) => createHash('sha256').update(value).digest('hex');
const sharedUrl = await load('lib/qr-login.ts'),
  shared = await import(sharedUrl);
const coreUrl = url(`
export const db=()=>globalThis.qrDb;export const now=()=>globalThis.qrNow;export const uid=()=>crypto.randomUUID();
export const hash=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))),x=>x.toString(16).padStart(2,'0')).join('');
export const base=()=> 'https://animonster.su';export const emailVerificationEnabled=()=>globalThis.qrVerify;
export class ApiError extends Error{constructor(message,status=400,code='request_failed'){super(message);this.status=status;this.code=code;}}
export const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export const fail=e=>json({error:e.message,code:e.code},e.status||500);export const body=r=>r.json();
export const sameOrigin=r=>{if(r.headers.get('origin')!=='https://animonster.su')throw new ApiError('origin',403,'bad_origin')};
export const cookie=(r,n)=>r.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(n+'='))?.slice(n.length+1)||'';
export const viewer=async r=>{const token=cookie(r,'am_session');if(!token)return null;return db().prepare('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.hash=? AND s.expires>?').bind(await hash(token),now()).first()};
export const requireUser=async r=>{const u=await viewer(r);if(!u)throw new ApiError('login',401,'authentication_required');if(u.suspended_until>now())throw new ApiError('suspended',403);if(emailVerificationEnabled()&&u.email&&!u.email_verified)throw new ApiError('email',403);return u};
`);
const serviceUrl = await load('lib/server/qr-login.ts', {
    './core': coreUrl,
    '../qr-login': sharedUrl,
  }),
  service = await import(serviceUrl);
const route = await import(
  await load('app/api/auth/qr/route.ts', {
    '@/lib/server/core': coreUrl,
    '@/lib/qr-login': sharedUrl,
    '@/lib/server/qr-login': serviceUrl,
    qrcode: import.meta.resolve('qrcode'),
  })
);
const request = (input, cookie = '', origin = 'https://animonster.su') =>
  route.POST(
    new Request('https://animonster.su/api/auth/qr', {
      method: 'POST',
      headers: {
        origin,
        cookie,
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0',
        'x-animonster-client-ip': 'test-ip',
      },
      body: JSON.stringify(input),
    }),
  );

void test('QR login binds initiating browser, requires explicit authenticated consent and consumes exactly once', async () => {
  const engine = new PGlite({ extensions: { pg_trgm } });
  globalThis.qrDb = adapter(engine);
  globalThis.qrNow = Date.now();
  globalThis.qrVerify = false;
  const phoneToken = 'phone-' + randomUUID(),
    bobToken = 'bob-' + randomUUID();
  const agent = 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0';
  try {
    for (const migration of (await readdir('migrations/postgres'))
      .filter((name) => name.endsWith('.sql'))
      .sort())
      await engine.exec(
        await readFile('migrations/postgres/' + migration, 'utf8'),
      );
    await engine.query(
      "INSERT INTO users(id,identity,nick,created_at) VALUES ('alice','test:alice','Alice',1),('bob','test:bob','Bob',1)",
    );
    for (const [token, user] of [
      [phoneToken, 'alice'],
      [bobToken, 'bob'],
    ])
      await engine.query(
        'INSERT INTO sessions(hash,user_id,expires) VALUES ($1,$2,$3)',
        [hash(token), user, globalThis.qrNow + 3600000],
      );
    const count = async () =>
      (await engine.query('SELECT count(*)::int AS n FROM sessions')).rows[0].n;
    assert.equal(
      (await request({ action: 'create' }, '', 'https://evil.test')).status,
      403,
    );
    assert.equal(
      (await request({ action: 'create' }, 'am_session=' + phoneToken)).status,
      409,
    );
    const response = await request({ action: 'create' });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(
      response.headers.get('set-cookie'),
      /HttpOnly; SameSite=Strict; Path=\/api\/auth\/qr; Max-Age=150; Secure/,
    );
    const browserCookie = response.headers.get('set-cookie').split(';')[0],
      flow = await response.json();
    assert.equal(flow.expiresAt - globalThis.qrNow, 120000);
    assert.equal(flow.browserToken, undefined);
    assert.equal(flow.scanToken, undefined);
    const decoded = await sharp(Buffer.from(flow.image.split(',')[1], 'base64'))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const scanned = jsQR(
      new Uint8ClampedArray(decoded.data),
      decoded.info.width,
      decoded.info.height,
    );
    assert.ok(scanned, 'independent QR decoder can read generated image');
    const scanUrl = new URL(scanned.data);
    assert.equal(scanUrl.origin, 'https://animonster.su');
    assert.equal(scanUrl.pathname, '/auth/qr');
    assert.equal(scanUrl.search, '');
    const [id, token] = scanUrl.hash.slice(1).split('.');
    assert.equal(id, flow.id);
    assert.ok(shared.validQrSecret(token));
    const stored = (
      await engine.query('SELECT * FROM qr_login_requests WHERE id=$1', [id])
    ).rows[0];
    assert.equal(stored.scan_hash, hash(token));
    assert.notEqual(stored.browser_hash, hash(token));
    assert.equal(stored.user_id, null);
    assert.equal((await request({ action: 'inspect', id, token })).status, 200);
    assert.equal(await count(), 2);
    assert.equal((await request({ action: 'poll', id })).status, 404);
    assert.equal(
      (
        await request(
          { action: 'poll', id },
          shared.qrCookieName(id) + '=' + token,
        )
      ).status,
      404,
    );
    assert.equal(
      (await request({ action: 'consume', id }, browserCookie)).status,
      409,
    );
    assert.equal(
      (await request({ action: 'approve', id, token, userId: 'alice' })).status,
      401,
    );
    assert.equal(
      (
        await request(
          { action: 'approve', id, token, userId: 'bob' },
          'am_session=' + phoneToken,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await request(
          { action: 'approve', id, token: '0'.repeat(64), userId: 'alice' },
          'am_session=' + phoneToken,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await request(
          { action: 'approve', id, token, userId: 'alice' },
          'am_session=' + phoneToken,
        )
      ).status,
      200,
    );
    assert.equal(
      await count(),
      2,
      'phone consent does not create a session yet',
    );
    assert.equal(
      (
        await request(
          { action: 'approve', id, token, userId: 'bob' },
          'am_session=' + bobToken,
        )
      ).status,
      409,
    );
    const poll = await request({ action: 'poll', id }, browserCookie);
    assert.deepEqual(await poll.json(), { status: 'approved' });
    assert.equal(
      (
        await request(
          { action: 'consume', id },
          browserCookie + '; am_session=' + bobToken,
        )
      ).status,
      409,
      'never replace an existing browser account',
    );
    const completions = await Promise.all([
      request({ action: 'consume', id }, browserCookie),
      request({ action: 'consume', id }, browserCookie),
    ]);
    assert.deepEqual(completions.map((r) => r.status).sort((a, b) => a - b), [200, 409]);
    assert.equal(await count(), 3);
    const cookies = completions
      .find((r) => r.status === 200)
      .headers.getSetCookie();
    const sessionCookie = cookies.find((value) =>
      value.startsWith('am_session='),
    );
    assert.match(
      sessionCookie,
      /HttpOnly; SameSite=Lax; Path=\/; Max-Age=2592000; Secure/,
    );
    const newToken = sessionCookie.split(';')[0].split('=')[1];
    assert.equal(
      (
        await engine.query('SELECT user_id FROM sessions WHERE hash=$1', [
          hash(newToken),
        ])
      ).rows[0].user_id,
      'alice',
    );
    assert.ok(cookies.some((value) => value.includes('Max-Age=0')));
    assert.equal(
      (await request({ action: 'consume', id }, browserCookie)).status,
      409,
    );

    const fresh = () => service.createQrLogin(agent, 'test-ip');
    let f = await fresh();
    await service.decideQrLogin(f.id, f.scanToken, null, '', false);
    await assert.rejects(service.consumeQrLogin(f.id, f.browserToken), {
      status: 409,
    });
    f = await fresh();
    await service.decideQrLogin(f.id, f.scanToken, 'alice', phoneToken, true);
    await service.pollQrLogin(f.id, f.browserToken, true);
    await assert.rejects(service.consumeQrLogin(f.id, f.browserToken), {
      status: 409,
    });
    f = await fresh();
    globalThis.qrNow += 120000;
    await assert.rejects(service.inspectQrLogin(f.id, f.scanToken), {
      status: 410,
    });
    await assert.rejects(
      service.decideQrLogin(f.id, f.scanToken, 'alice', phoneToken, true),
      { status: 410 },
    );
    await assert.rejects(service.consumeQrLogin(f.id, f.browserToken), {
      status: 410,
    });

    f = await fresh();
    await service.decideQrLogin(f.id, f.scanToken, 'alice', phoneToken, true);
    await engine.query('UPDATE users SET suspended_until=$1 WHERE id=$2', [
      globalThis.qrNow + 10000,
      'alice',
    ]);
    await assert.rejects(service.consumeQrLogin(f.id, f.browserToken), {
      code: 'qr_revoked',
    });
    await engine.query(
      "UPDATE users SET suspended_until=NULL,email='alice@example.test' WHERE id='alice'",
    );
    globalThis.qrVerify = true;
    await assert.rejects(service.consumeQrLogin(f.id, f.browserToken), {
      code: 'qr_revoked',
    });
    await assert.rejects(
      service.decideQrLogin(
        (await fresh()).id,
        '0'.repeat(64),
        'alice',
        phoneToken,
        true,
      ),
      { status: 404 },
    );
    globalThis.qrVerify = false;
    await engine.query('DELETE FROM sessions WHERE hash=$1', [
      hash(phoneToken),
    ]);
    await assert.rejects(service.consumeQrLogin(f.id, f.browserToken), {
      code: 'qr_revoked',
    });
    assert.equal(
      await count(),
      2,
      'failed/revoked/denied/expired flows never add sessions',
    );

    for (let n = 0; n < 10; n++) await service.qrLimit('rate-test', true);
    await assert.rejects(service.qrLimit('rate-test', true), { status: 429 });
    globalThis.qrNow += 600000;
    await service.qrLimit('rate-test', true);
    assert.equal(
      shared.qrDevice('Mozilla/5.0 (iPhone) AppleWebKit Safari/1'),
      'Safari · iOS',
    );
    assert.equal(
      shared.qrDevice('Mozilla/5.0 (Windows) Chrome/1 Edg/1'),
      'Microsoft Edge · Windows',
    );
  } finally {
    await engine.close();
    delete globalThis.qrDb;
    delete globalThis.qrNow;
    delete globalThis.qrVerify;
  }
});
