import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { NextRequest } from 'next/server.js';
import { titleRestrictionsUrl } from './helpers/title-restrictions.mjs';

const rules = await import(titleRestrictionsUrl);
const headers = (ip, extra = {}) =>
  new Headers({ ...(ip ? { 'x-animonster-client-ip': ip } : {}), ...extra });
const moduleUrl = (source) =>
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64');

void test('offline GeoIP recognises Russian IPv4, IPv6 and mapped IPv4; other countries stay open', async () => {
  for (const ip of ['77.88.8.8', '2a02:6b8::1', '::ffff:77.88.8.8']) {
    assert.equal(rules.visitorCountry(headers(ip)), 'RU');
    assert.equal(await rules.titleBlocked(headers(ip), 60058), true);
    assert.equal(await rules.titleBlocked(headers(ip), 21), false);
  }
  assert.equal(await rules.titleBlocked(headers('8.8.8.8'), 60058), false);
  assert.equal(
    await rules.titleBlocked(headers('2001:4860:4860::8888'), 60058),
    false,
  );
});

void test('unknown country fails closed only for disputed title; spoofed country and XFF cannot grant access', async () => {
  for (const ip of [null, '', 'garbage', '127.0.0.1', '1.1.1.1, 77.88.8.8']) {
    assert.equal(await rules.titleBlocked(headers(ip), 60058), true);
    assert.equal(await rules.titleBlocked(headers(ip), 21), false);
  }
  assert.equal(
    await rules.titleBlocked(
      headers('77.88.8.8', {
        'cf-ipcountry': 'DE',
        'x-forwarded-for': '8.8.8.8',
        'x-country': 'US',
      }),
      60058,
    ),
    true,
  );
  assert.equal(
    await rules.titleBlocked(
      headers(null, { 'x-forwarded-for': '8.8.8.8' }),
      60058,
    ),
    true,
  );
  assert.equal(
    await rules.titleBlocked(headers('77.88.8.8'), {
      id: 100123456,
      shikimori_id: 60058,
    }),
    true,
  );
});

void test('restricted API returns 451 without player data and points at the local VPN cabinet', async () => {
  const response = await rules.titleRestrictionResponse(
    headers('77.88.8.8'),
    60058,
  );
  assert.equal(response.status, 451);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await response.json(), {
    error: 'Тайтл заблокирован',
    code: 'title_region_restricted',
    redirect: '/vpn',
  });
  assert.equal(
    await rules.titleRestrictionResponse(headers('8.8.8.8'), 60058),
    null,
  );
});

const proxySource = stripTypeScriptTypes(
  await readFile(new URL('../proxy.ts', import.meta.url), 'utf8'),
)
  .replace(
    "'next/server'",
    JSON.stringify(import.meta.resolve('next/server.js')),
  )
  .replace(
    "'@/lib/server/title-restrictions'",
    JSON.stringify(titleRestrictionsUrl),
  )
  .replace(
    "'@/lib/server/title-blocked-page'",
    JSON.stringify(
      moduleUrl(
        stripTypeScriptTypes(
          await readFile(
            new URL('../lib/server/title-blocked-page.ts', import.meta.url),
            'utf8',
          ),
        ),
      ),
    ),
  );
const { proxy } = await import(moduleUrl(proxySource));

void test('complaint titles are unavailable worldwide on pages, RSC and player responses without VPN links', async () => {
  for (const id of [55825, 46569, 60460]) {
    for (const ip of ['8.8.8.8', '77.88.8.8', null]) {
      assert.equal(await rules.titleBlocked(headers(ip), id), true);
      assert.equal(await rules.titleBlocked(headers(ip), { id: 100000001, shikimori_id: id }), true);
      const api = await rules.titleRestrictionResponse(headers(ip), id);
      assert.equal(api.status, 451);
      assert.equal((await api.json()).code, 'title_unavailable');
      const response = await proxy(new NextRequest(`https://animonster.su/anime/${id}?episode=2`, { headers: headers(ip, { rsc: '1' }) }));
      assert.equal(response.status, 451);
      const html = await response.text();
      assert.match(html, /по требованию правообладателя/);
      assert.doesNotMatch(html, /\/vpn|<iframe|kodik/);
    }
  }
});

void test('page and RSC requests receive 451 HTML; allowed pages are never cached across regions', async () => {
  for (const path of [
    '/anime/60058',
    '/anime/60058/',
    '/anime/60058-oshi-no-ko?episode=2',
    '/anime/00060058?_rsc=test',
  ]) {
    const response = await proxy(
      new NextRequest('https://animonster.su' + path, {
        headers: headers('77.88.8.8', { rsc: '1' }),
      }),
    );
    assert.equal(response.status, 451);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const html = await response.text();
    assert.match(html, /Тайтл заблокирован/);
    assert.match(html, /http-equiv="refresh" content="7;url=\/vpn"/);
    assert.match(html, /href="\/vpn"/);
    assert.doesNotMatch(html, /kodik\.info|<iframe/);
  }
  const allowed = await proxy(
    new NextRequest('https://animonster.su/anime/60058', {
      headers: headers('8.8.8.8'),
    }),
  );
  assert.equal(allowed.headers.get('x-middleware-rewrite'), null);
  assert.equal(allowed.headers.get('cache-control'), 'private, no-store');
  for (const path of ['/anime/21', '/vpn', '/api/payments']) {
    const response = await proxy(
      new NextRequest('https://animonster.su' + path, {
        headers: headers('77.88.8.8'),
      }),
    );
    assert.equal(response.headers.get('x-middleware-rewrite'), null);
  }
});
