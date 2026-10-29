// Read-only raw HTML audit: no cookies, JavaScript execution or POST requests.
import { mkdir, writeFile } from 'node:fs/promises';
const origin = (process.argv[2] || 'https://animonster.su').replace(/\/$/, '');
const folder = process.argv[3] || 'work/seo-audit';
const strict = process.argv.includes('--assert');
const fixture = process.argv.includes('--fixture');
const outage = process.argv.includes('--outage');
const emptyHome = process.argv.includes('--empty-home');
const agent =
  process.argv.find((x) => x.startsWith('--agent='))?.slice(8) || 'YandexBot';
const site = 'https://animonster.su';
const theme = '/themes/' + encodeURIComponent('Исекай');
const genre = '/genres/' + encodeURIComponent('Комедия');
const paths = outage
  ? ['/', '/catalog', theme, '/sitemap.xml']
  : emptyHome
    ? ['/']
    : [
        '/',
        '/catalog',
        '/catalog?page=2',
        '/catalog?sort=fresh&page=2',
        '/genres',
        genre,
        '/themes',
        theme,
        theme + '?page=2',
        '/themes/' + encodeURIComponent('Исэкай'),
        '/genres/' + encodeURIComponent('Исэкай'),
        '/themes/' + encodeURIComponent('Магия'),
        '/themes/' + encodeURIComponent('Школа'),
        theme + '?genre=' + encodeURIComponent('Комедия'),
        '/anime/21?episode=3',
        '/anime/invalid_seo_id',
        '/genres/unknown-seo-genre',
        '/catalog?page=999999',
        theme + '?page=999999',
        '/themes/unknown-seo-theme',
        '/search?q=test',
        '/profile',
        '/profile/classic',
        '/bookmarks',
        '/downloads',
        '/downloads/watch?id=seo-fake',
        '/reset-password?token=SEO_AUDIT_FAKE_TOKEN',
        '/verify-email',
        '/auth/qr',
        '/watch/SEOFAKE',
        '/members/seo-audit-placeholder',
        '/browse/new',
        '/recommendations',
        '/robots.txt',
        '/sitemap.xml',
      ];
const rows = [],
  failures = [];
let requestNumber = 0;
await mkdir(folder, { recursive: true });
const decode = (value) =>
  value?.replaceAll('&amp;', '&').replaceAll('&quot;', '"');
const metas = (html, name) =>
  [...html.matchAll(/<meta\b[^>]*>/gi)]
    .filter((x) => new RegExp(`name=["']${name}["']`, 'i').test(x[0]))
    .map((x) => decode(x[0].match(/content=["']([^"']*)["']/i)?.[1] || ''));
function check(condition, path, message) {
  if (!condition) failures.push({ path, message });
}
async function request(path) {
  let target = new URL(path, origin),
    firstStatus;
  const redirects = [];
  const started = performance.now();
  for (let i = 0; i < 6; i++) {
    const response = await fetch(target, {
      redirect: 'manual',
      headers: { 'User-Agent': agent },
      signal: AbortSignal.timeout(25000),
    });
    firstStatus ??= response.status;
    if (
      [301, 302, 303, 307, 308].includes(response.status) &&
      response.headers.has('location')
    ) {
      const next = new URL(response.headers.get('location'), target);
      if (next.origin !== new URL(origin).origin)
        throw Error('External redirect not followed');
      redirects.push(response.status);
      target = next;
      await response.body?.cancel();
      continue;
    }
    const html = await response.text();
    const visible = html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');
    const canonicalTag =
      [...html.matchAll(/<link\b[^>]*>/gi)].find((x) =>
        /rel=["']canonical["']/.test(x[0]),
      )?.[0] || '';
    const availability =
      visible.match(
        /<section[^>]*class="cached-anime-availability"[\s\S]*?<\/section>/,
      )?.[0] || '';
    const row = {
      path,
      status: response.status,
      firstStatus,
      redirects,
      url: target.href,
      ms: Math.round(performance.now() - started),
      bytes: Buffer.byteLength(html),
      title: html.match(/<title>(.*?)<\/title>/s)?.[1],
      canonical: decode(canonicalTag.match(/href=["']([^"']*)["']/)?.[1]),
      h1: [...visible.matchAll(/<h1\b[^>]*>(.*?)<\/h1>/gs)].map((m) =>
        m[1].replace(/<[^>]*>/g, ''),
      ),
      robots: metas(html, 'robots'),
      googlebot: metas(html, 'googlebot'),
      xRobots: response.headers.get('x-robots-tag'),
      cache: response.headers.get('cache-control'),
      referrer: response.headers.get('referrer-policy'),
      animeLinks: (visible.match(/href="\/anime\//g) || []).length,
      nextLinks: (visible.match(/rel="next"/g) || []).length,
      serverEpisodes: [...availability.matchAll(/\?episode=(\d+)#watch/g)].map(
        (m) => Number(m[1]),
      ),
      hasServerVoiceovers: /Озвучки и субтитры/.test(availability),
      privateMediaInSummary: /kodik\.info|player_url|access_token/.test(
        availability,
      ),
      metrika: /mc\.yandex\.ru/.test(html),
      jsonLd: [
        ...html.matchAll(
          /<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs,
        ),
      ].map((m) => JSON.parse(m[1])),
      sitemapUrls: [...html.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) =>
        decode(m[1]),
      ),
    };
    row.htmlFile = `${++requestNumber}.html`;
    await writeFile(`${folder}/${row.htmlFile}`, html);
    return { row, html };
  }
  throw Error('Too many redirects');
}
for (const path of paths) {
  try {
    const { row, html } = await request(path);
    rows.push(row);
    if (outage) {
      check(
        row.status >= 500 && row.status < 600,
        path,
        'DB outage must remain a 5xx',
      );
      continue;
    }
    if (path === '/anime/invalid_seo_id' || path.includes('unknown-seo-') || path.includes('page=999999')) {
      check(row.status === 404, path, 'Unknown ID must be 404');
      check(row.robots.some(x => /noindex/.test(x)), path, '404 must not be indexable');
      continue;
    }
    check(row.status === 200, path, 'Expected HTTP 200');
    if (path === '/profile' || path === '/profile/classic')
      check(row.referrer === 'strict-origin-when-cross-origin', path, 'Do not change the native form Origin policy on profile');
    if (path.startsWith('/reset-password')) {
      check(
        /no-store/.test(row.cache || ''),
        path,
        'Token page requires no-store',
      );
      check(
        row.referrer === 'no-referrer',
        path,
        'Token page requires no-referrer',
      );
      check(!row.metrika, path, 'Token page must not include Metrika');
    }
    const noindex =
      /^(?:\/search|\/profile|\/bookmarks|\/downloads|\/reset-password|\/verify-email|\/auth|\/watch|\/members|\/browse)/.test(
        path,
      ) ||
      path.includes('sort=') ||
      path.includes('?genre=');
    if (noindex) {
      check(
        row.robots.some((x) => /\bnoindex\b/.test(x)),
        path,
        'Missing robots noindex',
      );
      check(
        !row.googlebot.some((x) => /(?:^|,\s*)index(?:,|$)/.test(x)),
        path,
        'Contradictory googlebot index',
      );
      check(
        row.googlebot.some((x) => /\bnoindex\b/.test(x)),
        path,
        'Missing explicit googlebot noindex',
      );
    }
    if (
      [
        '/',
        '/catalog',
        '/catalog?page=2',
        genre,
        theme,
        theme + '?page=2',
      ].includes(path)
    ) {
      check(row.h1.length === 1, path, 'Expected one H1 in source HTML');
      check(
        row.canonical &&
          new URL(row.canonical).href === new URL(site + path).href,
        path,
        'Wrong self-canonical',
      );
      if (!emptyHome)
        check(row.animeLinks > 0, path, 'Missing source HTML title links');
    }
    if (path === '/')
      check(
        row.h1[0] === 'Смотреть аниме онлайн на AniMonster',
        path,
        'Home H1 must be stable',
      );
    if (path === theme && !emptyHome)
      check(row.nextLinks > 0, path, 'Theme needs ordinary pagination links');
    if (/Исэкай/.test(decodeURIComponent(path))) {
      check(row.firstStatus === 308, path, 'Synonym must redirect permanently');
      check(
        new URL(row.url).pathname === theme,
        path,
        'Wrong canonical synonym target',
      );
    }
    for (const data of row.jsonLd.filter(
      (x) => x['@type'] === 'CollectionPage',
    ))
      check(
        data.url === row.canonical,
        path,
        'JSON-LD URL and canonical differ',
      );
    if (path.startsWith('/anime/21?')) {
      check(
        row.canonical === site + '/anime/21',
        path,
        'Episode variant must canonicalize to the title',
      );
      check(
        !row.privateMediaInSummary,
        path,
        'Private media URL in public SSR summary',
      );
      if (fixture) {
        check(
          JSON.stringify(row.serverEpisodes) === '[1,3]',
          path,
          'Only confirmed fixture episodes may appear',
        );
        check(
          row.hasServerVoiceovers && html.includes('SEO Studio'),
          path,
          'Missing cached voiceover names',
        );
      }
    }
    if (path === '/robots.txt')
      check(
        !/^Disallow:\s*\/(?:profile|reset-password|watch)/m.test(html),
        path,
        'Crawler cannot read noindex',
      );
    if (path === '/sitemap.xml') {
      const urls = row.sitemapUrls;
      check(
        urls.length > 5 && urls.length <= 50000,
        path,
        'Empty/oversized sitemap',
      );
      check(new Set(urls).size === urls.length, path, 'Duplicate sitemap URLs');
      check(
        urls.includes(site + theme),
        path,
        'Canonical Isekai theme missing from sitemap',
      );
      check(
        !urls.some(
          (x) =>
            new URL(x).search ||
            /\/(?:search|profile|reset-password|bookmarks|members|auth|watch|downloads)(?:\/|$)/.test(
              new URL(x).pathname,
            ),
        ),
        path,
        'Technical or query URL in sitemap',
      );
      const samples = [
        ...new Set([
          ...urls.filter((x) => /\/themes\//.test(x)).slice(0, 3),
          ...urls.filter((x) => /\/genres\//.test(x)).slice(0, 2),
          ...urls.filter((x) => /\/anime\//.test(x)).slice(0, 3),
        ]),
      ];
      row.sampleChecks = [];
      for (const url of samples) {
        const { row: sampled } = await request(new URL(url).pathname);
        row.sampleChecks.push({
          url,
          status: sampled.status,
          redirects: sampled.redirects,
          canonical: sampled.canonical,
        });
        check(
          sampled.status === 200 && sampled.redirects.length === 0,
          url,
          'Sitemap sample returns an error/redirect',
        );
        check(
          sampled.canonical &&
            new URL(sampled.canonical).href === new URL(url).href,
          url,
          'Sitemap sample is not self-canonical',
        );
        check(
          !sampled.robots.some((x) => /noindex/.test(x)),
          url,
          'Sitemap sample is noindex',
        );
      }
    }
  } catch (error) {
    rows.push({ path, error: error.message });
    failures.push({ path, message: error.message });
  }
}
await writeFile(
  `${folder}/results.json`,
  JSON.stringify(
    {
      origin,
      agent,
      javascript: false,
      readOnly: true,
      fixture,
      outage,
      rows,
      failures,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    origin,
    agent,
    requests: rows.length,
    failures: failures.length,
    results: `${folder}/results.json`,
  }),
);
for (const failure of failures) console.log(JSON.stringify(failure));
if (strict && failures.length) process.exitCode = 1;
