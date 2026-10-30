import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

const url = (source) =>
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
async function load(path, replacements = {}) {
  let source = ts.transpileModule(await readFile(path, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  for (const [name, value] of Object.entries({
    'react/jsx-runtime': import.meta.resolve('react/jsx-runtime'),
    react: import.meta.resolve('react'),
    ...replacements,
  }))
    source = source
      .replaceAll(`from '${name}'`, `from ${JSON.stringify(value)}`)
      .replaceAll(`from "${name}"`, `from ${JSON.stringify(value)}`);
  const moduleUrl = url(source);
  return { moduleUrl, ...(await import(moduleUrl)) };
}
const seo = await load('lib/seo.ts');
const taxonomy = await load('lib/anime-taxonomy.ts');
const ld = await load('components/seo-json-ld.tsx');
const pagination = await load('components/catalog-pagination.tsx', {
  '@/lib/seo': seo.moduleUrl,
});
const nav = url(
  `export const notFound=()=>{throw new Error('NOT_FOUND')};export const redirect=p=>{throw new Error('REDIRECT '+p)};export const permanentRedirect=redirect;`,
);
const library = url(
  `export async function cachedCatalogPage(options) { globalThis.seoQuery=options; if(globalThis.seoFailure)throw new Error('Database unavailable'); return {items:[{id:options.offset+1,russian:'Тайтл '+(options.offset+1),name:'Title'}],total:globalThis.seoTotal ?? 48}; } export async function genreList(){return [{name:'Комедия'}]}`,
);
const view = url(
  `import {createElement as h} from ${JSON.stringify(import.meta.resolve('react'))};export default function View(p){return h('a',{href:'/anime/'+p.initialItems[0].id},p.initialItems[0].russian)};export const CommunityHeader=()=>null;export const GenreCatalog=()=>null;export const AnimeGrid=({items})=>h('div',null,items.map(a=>h('a',{key:a.id,href:'/anime/'+a.id},a.russian)));`,
);
const catalog = await load('app/catalog/page.tsx', {
  'next/navigation': nav,
  '@/lib/server/library': library,
  '@/lib/seo': seo.moduleUrl,
  '@/components/seo-json-ld': ld.moduleUrl,
  './client-page': view,
});
const props = (p) => ({ searchParams: Promise.resolve(p) });

test('catalog page 2 requests a different slice and exposes it in server HTML', async () => {
  const html = renderToStaticMarkup(
    await catalog.default(props({ page: '2' })),
  );
  assert.equal(globalThis.seoQuery.offset, 24);
  assert.match(html, /href="\/anime\/25"/);
  const meta = await catalog.generateMetadata(props({ page: '2' }));
  assert.equal(meta.alternates.canonical, '/catalog?page=2');
  assert.match(meta.title, /страница 2/);
  const data = JSON.parse(
    html.match(/application\/ld\+json">(.*?)<\/script>/)[1],
  );
  assert.equal(data.mainEntity.itemListElement[0].position, 25);
});
test('ongoing page and sort retain filters and correct canonical', async () => {
  await catalog.default(props({ tab: 'ongoing', page: '2', sort: 'fresh' }));
  assert.equal(globalThis.seoQuery.status, 'ongoing');
  assert.equal(globalThis.seoQuery.sort, 'fresh');
  const meta = await catalog.generateMetadata(
    props({ tab: 'ongoing', page: '2', sort: 'fresh' }),
  );
  assert.equal(meta.alternates.canonical, '/catalog?tab=ongoing&page=2');
  assert.equal(meta.robots.index, false);
  assert.equal(meta.robots.googleBot.index, false);
  const html = renderToStaticMarkup(
    await catalog.default(props({ tab: 'ongoing', page: '2', sort: 'fresh' })),
  );
  const data = JSON.parse(
    html.match(/application\/ld\+json">(.*?)<\/script>/)[1],
  );
  assert.equal(data.url, 'https://animonster.su' + meta.alternates.canonical);
});
test('out-of-range pages return notFound and database failure is not disguised as 404', async () => {
  await assert.rejects(catalog.default(props({ page: '3' })), /NOT_FOUND/);
  globalThis.seoFailure = true;
  try {
    await assert.rejects(catalog.default(props({})), /Database unavailable/);
  } finally {
    delete globalThis.seoFailure;
  }
});
test('pagination uses crawlable links and retains filters', () => {
  const html = renderToStaticMarkup(
    createElement(pagination.CatalogPagination, {
      path: '/catalog',
      page: 2,
      pages: 3,
      tab: 'ongoing',
    }),
  );
  assert.match(html, /href="\/catalog\?tab=ongoing"/);
  assert.match(html, /href="\/catalog\?tab=ongoing&amp;page=3"/);
  assert.doesNotMatch(html, /<button/);
});
test('hostile content stays inside JSON-LD and title uses only the known year', () => {
  const html = renderToStaticMarkup(
    createElement(ld.SeoJsonLd, { data: { name: '</script><h1>fake</h1>' } }),
  );
  assert.equal((html.match(/<\/script>/g) || []).length, 1);
  assert.equal(
    JSON.parse(html.match(/application\/ld\+json">(.*?)<\/script>/)[1]).name,
    '</script><h1>fake</h1>',
  );
  assert.match(
    seo.animeTitle({ russian: 'Тайтл', aired_on: '2023-01-01' }),
    /Тайтл \(2023\)/,
  );
  assert.doesNotMatch(
    seo.animeTitle({ russian: 'Тайтл', aired_on: 'unknown' }),
    /unknown/,
  );
  assert.equal(seo.pageNumber('Infinity'), 1);
  assert.equal(seo.pageNumber('-1'), 1);
});
const genres = await load('app/genres/[genre]/page.tsx', {
  react: import.meta.resolve('react'),
  'next/navigation': nav,
  '@/lib/server/theme-landings': url(
    "export const themeLandings=async()=>['Исекай','Магия','Школа']",
  ),
  '@/lib/server/library': library,
  '@/lib/anime-taxonomy': taxonomy.moduleUrl,
  '@/components/community/context': view,
  '@/components/genre-catalog': view,
  '@/components/seo-json-ld': ld.moduleUrl,
  '@/lib/seo': seo.moduleUrl,
});
test('genre metadata is unique and unknown genres return notFound', async () => {
  const p = {
    params: Promise.resolve({ genre: 'Комедия' }),
    searchParams: Promise.resolve({ page: '2' }),
  };
  const meta = await genres.generateMetadata(p);
  assert.match(meta.title, /Комедия.*страница 2/);
  const encodedMeta = await genres.generateMetadata({
    ...p,
    params: Promise.resolve({ genre: encodeURIComponent('Комедия') }),
  });
  assert.equal(encodedMeta.alternates.canonical, meta.alternates.canonical);
  assert.equal(
    meta.alternates.canonical,
    '/genres/' + encodeURIComponent('Комедия') + '?page=2',
  );
  await genres.default(p);
  assert.equal(globalThis.seoQuery.genre, 'Комедия');
  assert.equal(globalThis.seoQuery.offset, 24);
  await assert.rejects(
    genres.default({ ...p, params: Promise.resolve({ genre: 'unknown' }) }),
    /NOT_FOUND/,
  );
});
const animePage = await load('app/anime/[id]/page.tsx', {
  'next/navigation': nav,
  'next/headers': url('export const headers=async()=>new Headers()'),
  '@/lib/server/title-restrictions': url(
    'export const titleBlocked=async()=>false',
  ),
  '@/components/anime-page': url(
    `import {createElement as h,Fragment} from ${JSON.stringify(import.meta.resolve('react'))};export const AnimePage=({anime,initialRelations,cachedAvailability})=>h(Fragment,null,h('h1',null,anime.russian),cachedAvailability);`,
  ),
  '@/lib/server/library': url(
    `export const getAnime=async()=>{if(globalThis.seoUpstreamError)throw globalThis.seoUpstreamError;return null};export const getAnimeByAlias=getAnime;`,
  ),
  '@/lib/anime': url(`export const posterUrl=()=>'/poster.jpg'`),
  '@/lib/server/core': url(
    `export const db=()=>({prepare:()=>({bind:()=>({first:async()=>globalThis.seoAnime?{data:JSON.stringify(globalThis.seoAnime)}:null})})});`,
  ),
  '@/lib/seo': seo.moduleUrl,
  '@/lib/server/anime-relations': url(
    'export const animeRelations=async()=>({mainline:[],branches:[],related:[]})',
  ),
  '@/lib/server/public-anime-availability': url(
    "export const publicAnimeAvailability=async()=>({status:'cached',total:0,episodes:[],voiceovers:[]})",
  ),
  '@/components/cached-anime-availability': (
    await load('components/cached-anime-availability.tsx')
  ).moduleUrl,
});
test('anime source HTML includes real facts and Movie schema omits series-only fields', async () => {
  globalThis.seoAnime = {
    id: 1,
    russian: 'Фильм',
    name: 'Movie',
    aired_on: '2023',
    kind: 'movie',
    episodes: 1,
    genres: ['Комедия'],
  };
  try {
    const p = { params: Promise.resolve({ id: '1' }) };
    const meta = await animePage.generateMetadata(p);
    assert.equal(meta.alternates.canonical, '/anime/1');
    const html = renderToStaticMarkup(await animePage.default(p));
    assert.match(html, /<h1>Фильм<\/h1>/);
    const data = JSON.parse(
      html.match(/application\/ld\+json">(.*?)<\/script>/)[1],
    );
    assert.equal(data['@type'], 'Movie');
    assert.equal(data.numberOfEpisodes, undefined);
    assert.equal(data.datePublished, undefined);
  } finally {
    delete globalThis.seoAnime;
  }
});
test('unknown anime returns notFound; transient upstream error remains a server failure', async () => {
  const p = { params: Promise.resolve({ id: '999999999' }) };
  await assert.rejects(animePage.default(p), /NOT_FOUND/);
  globalThis.seoUpstreamError = new Error('Temporarily unavailable');
  try {
    await assert.rejects(animePage.default(p), /Temporarily unavailable/);
  } finally {
    delete globalThis.seoUpstreamError;
  }
  await assert.rejects(
    animePage.default({ params: Promise.resolve({ id: 'invalid_seo_id' }) }),
    /NOT_FOUND/,
  );
});

const themePages = await load('app/themes/[theme]/page.tsx', {
  'next/navigation': nav,
  '@/lib/server/theme-landings': url(
    "export const themeLandings=async()=>{if(globalThis.seoFailure)throw Error('Database unavailable');return ['Исекай','Магия','Школа']}",
  ),
  '@/lib/server/library': library,
  '@/lib/anime-taxonomy': taxonomy.moduleUrl,
  '@/lib/seo': seo.moduleUrl,
  '@/lib/theme-copy': (await load('lib/theme-copy.ts')).moduleUrl,
  '@/components/community/context': view,
  '@/components/anime-grid': view,
  '@/components/catalog-pagination': pagination.moduleUrl,
  '@/components/seo-json-ld': ld.moduleUrl,
});
const themeProps = (theme, page = '1') => ({
  params: Promise.resolve({ theme }),
  searchParams: Promise.resolve({ page }),
});

test('theme pages render a DB slice, facts, pagination and matching canonical/JSON-LD', async () => {
  const p = themeProps('Исекай');
  const html = renderToStaticMarkup(await themePages.default(p));
  assert.equal(globalThis.seoQuery.theme, 'Исекай');
  assert.match(html, /href="\/anime\/1"/);
  assert.match(html, /Исекай — истории/);
  assert.match(
    html,
    /href="\/themes\/%D0%98%D1%81%D0%B5%D0%BA%D0%B0%D0%B9\?page=2"/,
  );
  const second = await themePages.generateMetadata(themeProps('Исекай', '2'));
  assert.equal(
    second.alternates.canonical,
    taxonomy.themeUrl('Исекай') + '?page=2',
  );
  assert.match(second.title, /страница 2/);
  const first = await themePages.generateMetadata(p);
  assert.equal(
    JSON.parse(html.match(/application\/ld\+json">(.*?)<\/script>/)[1]).url,
    seo.SITE_URL + first.alternates.canonical,
  );
  const magic = await themePages.generateMetadata(themeProps('Магия'));
  const school = await themePages.generateMetadata(themeProps('Школа'));
  assert.notEqual(first.description, magic.description);
  assert.notEqual(magic.description, school.description);
});

test('theme synonyms and the old genre URLs have one permanent canonical target', async () => {
  for (const name of ['Исэкай', 'исекай', ' Исекай ']) {
    await assert.rejects(
      themePages.default(themeProps(name, '2')),
      (error) =>
        error.message === 'REDIRECT ' + taxonomy.themeUrl('Исекай') + '?page=2',
    );
    assert.equal(taxonomy.themeUrl(name), taxonomy.themeUrl('Исекай'));
  }
  await assert.rejects(
    genres.default({
      params: Promise.resolve({ genre: 'Исэкай' }),
      searchParams: Promise.resolve({ page: '2' }),
    }),
    /REDIRECT \/themes\//,
  );
  const meta = await themePages.generateMetadata(
    themeProps(encodeURIComponent('Исекай')),
  );
  assert.equal(meta.alternates.canonical, taxonomy.themeUrl('Исекай'));
});

test('unknown, empty and excessive theme pages are 404; database failures are not 404 or empty success', async () => {
  await assert.rejects(
    themePages.default(themeProps('Ненастоящая тема')),
    /NOT_FOUND/,
  );
  await assert.rejects(
    themePages.default(themeProps('Исекай', '3')),
    /NOT_FOUND/,
  );
  globalThis.seoTotal = 0;
  try {
    await assert.rejects(themePages.default(themeProps('Исекай')), /NOT_FOUND/);
  } finally {
    delete globalThis.seoTotal;
  }
  globalThis.seoFailure = true;
  try {
    await assert.rejects(
      themePages.default(themeProps('Исекай')),
      /Database unavailable/,
    );
  } finally {
    delete globalThis.seoFailure;
  }
});

const policy = await load('lib/seo-policy.ts');
test('technical layouts override robots and googlebot; crawler can read noindex', async () => {
  for (const route of [...policy.PRIVATE_PAGE_SEGMENTS, 'members', 'browse']) {
    const mod = await load(`app/${route}/layout.tsx`, {
      '@/lib/seo': seo.moduleUrl,
      '@/components/community/admin-surface': url(
        'export const AdminSurface=()=>null',
      ),
    });
    assert.equal(mod.metadata.robots.index, false, route);
    assert.equal(mod.metadata.robots.googleBot.index, false, route);
    if (route === 'profile') assert.equal(mod.metadata.referrer, undefined, 'Native VK POST must keep the same-origin Origin policy');
  }
  const robots = (await load('app/robots.ts')).default();
  assert.equal(robots.rules[0].disallow, undefined);
  const search = await load('app/search/layout.tsx', {
    '@/lib/seo': seo.moduleUrl,
  });
  assert.equal(search.metadata.robots.googleBot.index, false);
  for (const value of [
    '/reset-password?token=FAKE',
    '/auth/qr#FAKE.SECRET',
    '/watch/PRIVATE',
    '/catalog?token=FAKE',
    '/?access_token=FAKE',
    '/?state=FAKE',
  ])
    assert.equal(policy.analyticsLocation(value), null);
  assert.equal(
    policy.analyticsLocation('/catalog?page=2#watch'),
    '/catalog?page=2',
  );
  const config = (
    await load('next.config.ts', { './lib/seo-policy': policy.moduleUrl })
  ).default;
  const headers = await config.headers();
  assert.ok(
    headers.some(
      (row) =>
        row.source.includes('reset-password') &&
        row.headers.some(
          (h) => h.key === 'Cache-Control' && h.value.includes('no-store'),
        ),
    ),
  );
  assert.ok(
    headers.some(
      (row) =>
        row.has?.some((h) => h.key === 'token') &&
        row.headers.some(
          (h) => h.key === 'Referrer-Policy' && h.value === 'no-referrer',
        ),
    ),
  );
  const metrika = await readFile('components/yandex-metrika.tsx', 'utf8');
  assert.match(metrika, /if \(sensitive\) return null/);
  assert.match(metrika, /analyticsLocation\(document.referrer\)/);
});

test('home has no extra promotional heading and the first anime title is H1', async () => {
  const home = await readFile('components/home-page-client.tsx', 'utf8');
  assert.doesNotMatch(home, /home-page-heading|Смотреть аниме онлайн на AniMonster|<h1\b/);
  const hero = await readFile('components/popular-hero.tsx', 'utf8');
  assert.match(hero, /i === 0 \? \(\s*<h1 className="hero-title">/);
  assert.match(hero, /<h2 className="hero-title">/);
  const heroStyles = await readFile('app/community.css', 'utf8');
  assert.match(heroStyles, /\.anime-hero :where\(h2\.hero-title\)/);
});

// Exercise the real SQL against the same PostgreSQL schema, not a fake list.
const { PGlite } = await import('@electric-sql/pglite');
const { pg_trgm } = await import('@electric-sql/pglite/contrib/pg_trgm');
const { readdir } = await import('node:fs/promises');
const engine = new PGlite({ extensions: { pg_trgm } });
for (const file of (await readdir('migrations/postgres'))
  .filter((x) => x.endsWith('.sql'))
  .sort())
  await engine.exec(await readFile('migrations/postgres/' + file, 'utf8'));
after(() => engine.close());
const fixtureTime = Date.now();
globalThis.seoDataDb = {
  prepare(source) {
    let i = 0,
      values = [];
    const sql = source.replace(/\?/g, () => '$' + ++i);
    return {
      bind(...args) {
        values = args;
        return this;
      },
      async all() {
        return { results: (await engine.query(sql, values)).rows };
      },
      async first() {
        return (await engine.query(sql, values)).rows[0] || null;
      },
    };
  },
};
const dataCore = url(
  `export const db=()=>{if(globalThis.seoDbBroken)throw Error('Database offline');return globalThis.seoDataDb};export const now=()=>${fixtureTime};export const runtime=()=>({});`,
);
const themesData = await load('lib/server/theme-landings.ts', {
  './core': dataCore,
  '@/lib/anime-taxonomy': taxonomy.moduleUrl,
});
const restrictions = url(
  'export const titleBlocked=async()=>!!globalThis.seoRegionBlocked;export const visitorCountry=()=>globalThis.seoCountry||null',
);
const kodik = await load('lib/server/kodik.ts', {
  '@/lib/server/core': dataCore,
  '@/lib/anime': url(
    "export const kodikPlayerPath=(id,translation)=>'/api/kodik/player?anime='+id+'&translation='+translation",
  ),
});
const availability = await load('lib/server/public-anime-availability.ts', {
  './core': dataCore,
  './kodik': kodik.moduleUrl,
  './title-restrictions': restrictions,
});
const publicView = await load('components/cached-anime-availability.tsx');
const purePolicy = await load('lib/title-policy.ts');
const dataLibrary = await load('lib/server/library.ts', {
  './core': dataCore,
  './theme-landings': themesData.moduleUrl,
  '@/lib/anime-taxonomy': taxonomy.moduleUrl,
  '../title-policy': purePolicy.moduleUrl,
  './anime-taxonomy': url('export const genreEntries=async rows=>rows'),
  './anime': url(
    'export const findRelease=()=>null,liberty=()=>{throw Error("Network forbidden")},available=()=>true,normalize=x=>x',
  ),
  './search-metadata': url(
    'export const canonicalizeAnimeIdentities=async x=>x,ensureSearchMetadata=()=>{}',
  ),
  './anime-relations': url('export const ensureRelationState=()=>{}'),
});
const sourceAnime = {
  id: 21,
  russian: 'Тестовое аниме',
  name: 'Test',
  kind: 'tv',
  status: 'ongoing',
  episodes: 999,
  aired_on: '2024',
  genres: ['Комедия'],
};
for (let id = 1; id <= 30; id++) {
  const anime = { ...sourceAnime, id };
  await engine.query(
    "INSERT INTO anime_cache(id,data,episodes,updated_at,genres_index) VALUES($1,$2,'[]',$3,$4)",
    [
      id,
      JSON.stringify(anime),
      fixtureTime,
      JSON.stringify(['Комедия', ...(id === 1 ? ['Школа'] : [])]),
    ],
  );
  await engine.query(
    'INSERT INTO anime_search_metadata(anime_id,themes) VALUES($1,$2)',
    [
      id,
      JSON.stringify([
        id % 2 ? 'Исекай' : 'Исэкай',
        ...(id === 1 ? ['Магия'] : []),
      ]),
    ],
  );
}
await engine.query(
  'INSERT INTO catalog_page_cache(cache_key,data,updated_at) VALUES($1,$2,$3)',
  [
    'taxonomy:shikimori:v1',
    JSON.stringify(
      ['Исекай', 'Магия', 'Школа', 'Пустая тема'].map((russian) => ({
        id: russian,
        russian,
        kind: 'theme',
      })),
    ),
    fixtureTime,
  ],
);

test('theme SQL deduplicates synonyms, includes legacy thematic tags and excludes empty taxonomy entries', async () => {
  assert.deepEqual(await themesData.themeLandings(), [
    'Исекай',
    'Магия',
    'Школа',
  ]);
  const first = await dataLibrary.cachedCatalogPage({
    theme: 'Исекай',
    limit: 24,
  });
  const next = await dataLibrary.cachedCatalogPage({
    theme: 'Исэкай',
    limit: 24,
    offset: 24,
  });
  assert.equal(first.total, 30);
  assert.equal(first.items.length, 24);
  assert.equal(next.total, 30);
  assert.equal(next.items.length, 6);
  assert.equal(
    new Set([...first.items, ...next.items].map((x) => x.id)).size,
    30,
  );
  assert.equal(
    (await dataLibrary.cachedCatalogPage({ theme: 'Школа' })).total,
    1,
  );
  assert.equal(
    (await dataLibrary.cachedCatalogPage({ theme: 'Магия' })).total,
    1,
  );
  const savedTaxonomy = (await engine.query("SELECT data FROM catalog_page_cache WHERE cache_key='taxonomy:shikimori:v1'")).rows[0].data;
  try {
    await engine.query("UPDATE catalog_page_cache SET data=$1 WHERE cache_key='taxonomy:shikimori:v1'", [JSON.stringify(JSON.parse(savedTaxonomy).map(x=>x.russian==='Магия'?{...x,kind:'genre'}:x))]);
    assert.ok(!(await themesData.themeLandings()).includes('Магия'), 'An existing genre must not get a duplicate theme landing');
  } finally {
    await engine.query("UPDATE catalog_page_cache SET data=$1 WHERE cache_key='taxonomy:shikimori:v1'", [savedTaxonomy]);
  }
  globalThis.seoDbBroken = true;
  try {
    await assert.rejects(themesData.themeLandings(), /Database offline/);
  } finally {
    delete globalThis.seoDbBroken;
  }
});

test('SSR availability uses exact sparse episode maps, preserves Plus and serializes no media URLs', async (t) => {
  t.mock.method(globalThis, 'fetch', () => {
    throw Error('Provider must not run on SSR');
  });
  const payload = {
    id: 'source',
    type: 'anime-serial',
    shikimori_id: 21,
    title: 'Test',
    link: 'https://kodik.info/serial/1/private/',
    episodes_count: 999,
    translation: { id: 7, title: 'Студия <test>', type: 'voice' },
    seasons: {
      1: {
        episodes: {
          1: 'https://kodik.info/video/1/private/',
          3: 'https://kodik.info/video/3/private/',
        },
      },
    },
  };
  await engine.query(
    "INSERT INTO anime_sources(provider,source_id,anime_id,payload,last_seen_at) VALUES('kodik','source',21,$1,$2)",
    [JSON.stringify(payload), fixtureTime],
  );
  // A stale per-episode link must not fill a hole in the current exact map.
  await engine.query(
    "INSERT INTO kodik_episode_links VALUES(21,7,2,'https://kodik.info/video/stale/private/',$1)",
    [fixtureTime - 1000],
  );
  await engine.query(
    'INSERT INTO anime_episode_availability VALUES(21,1,$1,$1),(21,3,$1,$2)',
    [fixtureTime - 1000, fixtureTime + 86400000],
  );
  const data = await availability.publicAnimeAvailability(
    sourceAnime,
    new Headers(),
  );
  assert.deepEqual(data.episodes, [
    { ordinal: 1, access: 'free' },
    { ordinal: 3, access: 'plus' },
  ]);
  assert.equal(data.total, 2);
  assert.equal(data.voiceovers[0].title, 'Студия <test>');
  const html = renderToStaticMarkup(
    createElement(publicView.CachedAnimeAvailability, { animeId: 21, data }),
  );
  assert.match(html, /Серия 3/);
  assert.doesNotMatch(
    html,
    /Серия 2<|Серия 999|kodik\.info|private\/|player_url|access_token/,
  );
  assert.match(html, /ранний доступ Plus/);
  assert.match(html, /Студия &lt;test&gt;/);
  assert.match(html, /href="\/anime\/21\?episode=3#watch"/);
  assert.deepEqual(
    (
      await availability.publicAnimeAvailability(
        { ...sourceAnime, is_adult: true },
        new Headers(),
      )
    ).episodes,
    [],
  );
  assert.deepEqual(
    (
      await availability.publicAnimeAvailability(
        { ...sourceAnime, status: 'anons' },
        new Headers(),
      )
    ).episodes,
    [],
  );
  globalThis.seoRegionBlocked = true;
  try {
    assert.equal(
      (await availability.publicAnimeAvailability(sourceAnime, new Headers()))
        .status,
      'region-restricted',
    );
  } finally {
    delete globalThis.seoRegionBlocked;
  }
  await engine.query(
    "UPDATE anime_sources SET payload=$1 WHERE source_id='source'",
    [JSON.stringify({ ...payload, seasons: {}, episodes_count: 999 })],
  );
  const stored = await availability.publicAnimeAvailability(
    sourceAnime,
    new Headers(),
  );
  assert.deepEqual(stored.episodes, [{ ordinal: 2, access: 'unknown' }]);
  await engine.query('DELETE FROM kodik_episode_links WHERE anime_id=21');
  assert.equal(
    (await availability.publicAnimeAvailability(sourceAnime, new Headers()))
      .total,
    0,
  );
  globalThis.seoDbBroken = true;
  try {
    await assert.rejects(
      availability.publicAnimeAvailability(sourceAnime, new Headers()),
      /Database offline/,
    );
  } finally {
    delete globalThis.seoDbBroken;
  }
});

test('home does not disguise catalog DB failure as an empty selection', async () => {
  const home = await load('lib/server/home.ts', {
    './core': dataCore,
    './library': url(
      "export const cachedCatalog=async()=>{throw Error('Catalog offline')}",
    ),
  });
  await assert.rejects(home.cachedHomePopular(), /Catalog offline/);
});

test('sitemap includes only canonical nonempty themes and propagates DB failure', async () => {
  for (const id of [55825, 60058])
    await engine.query(
      "INSERT INTO anime_cache(id,data,episodes,updated_at) VALUES($1,$2,'[]',$3)",
      [id, JSON.stringify({ ...sourceAnime, id }), fixtureTime],
    );
  const entries = await dataLibrary.sitemapAnime();
  assert.ok(entries.some((x) => x.id === 21));
  assert.ok(!entries.some((x) => [55825, 60058].includes(x.id)));
  const sitemap = await load('app/sitemap.ts', {
    '@/lib/server/library': url(
      "export const sitemapGenres=async()=>['Комедия'];export const sitemapAnime=async()=>{if(globalThis.seoDbBroken)throw Error('Database offline');return [{id:21}]}",
    ),
    '@/lib/server/theme-landings': themesData.moduleUrl,
    '@/lib/anime-taxonomy': taxonomy.moduleUrl,
  });
  const rows = await sitemap.default();
  const urls = rows.map((x) => x.url);
  assert.equal(new Set(urls).size, urls.length);
  assert.ok(urls.includes(seo.SITE_URL + taxonomy.themeUrl('Исекай')));
  assert.ok(
    !urls.some((x) =>
      /Исэкай|%D0%98%D1%81%D1%8D|search|profile|reset-password|token=|episode=/.test(
        x,
      ),
    ),
  );
  globalThis.seoDbBroken = true;
  try {
    await assert.rejects(sitemap.default(), /Database offline/);
  } finally {
    delete globalThis.seoDbBroken;
  }
});
