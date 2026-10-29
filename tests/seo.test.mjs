import assert from 'node:assert/strict';
import test from 'node:test';
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
const ld = await load('components/seo-json-ld.tsx');
const pagination = await load('components/catalog-pagination.tsx', {
  '@/lib/seo': seo.moduleUrl,
});
const nav = url(
  `export const notFound=()=>{throw new Error('NOT_FOUND')};export const redirect=p=>{throw new Error('REDIRECT '+p)};`,
);
const library = url(
  `export async function cachedCatalogPage(options) { globalThis.seoQuery=options; if(globalThis.seoFailure)throw new Error('Database unavailable'); return {items:[{id:options.offset+1,russian:'Тайтл '+(options.offset+1),name:'Title'}],total:48}; } export async function genreList(){return [{name:'Комедия'}]}`,
);
const view = url(
  `import {createElement as h} from ${JSON.stringify(import.meta.resolve('react'))};export default function View(p){return h('a',{href:'/anime/'+p.initialItems[0].id},p.initialItems[0].russian)};export const CommunityHeader=()=>null;export const GenreCatalog=()=>null;`,
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
  '@/lib/server/anime-taxonomy': url(
    'export const animeTaxonomy=async()=>({themes:[]})',
  ),
  '@/lib/server/library': library,
  '@/lib/anime-taxonomy': url('export const tagKey=s=>s.toLowerCase()'),
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
    `import {createElement as h} from ${JSON.stringify(import.meta.resolve('react'))};export const AnimePage=({anime,initialRelations})=>h('h1',null,anime.russian);`,
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
