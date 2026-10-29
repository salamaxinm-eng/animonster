import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import { resolveSitemap } from 'next/dist/build/webpack/loaders/metadata/resolve-route-data.js';
const url = (source) =>
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const library = url(
  `export async function sitemapGenres() {return globalThis.sitemapGenres || [];} export async function sitemapAnime(limit) { globalThis.sitemapLimit=limit; if(globalThis.sitemapFailure) throw new Error('Unavailable');return globalThis.sitemapRows.slice(0,limit); }`,
);
const source = stripTypeScriptTypes(
  await readFile('app/sitemap.ts', 'utf8'),
).replace("'@/lib/server/library'", JSON.stringify(library))
  .replace("'@/lib/server/theme-landings'", JSON.stringify(url('export const themeLandings=async()=>globalThis.sitemapThemes||[];')))
  .replace("'@/lib/anime-taxonomy'", JSON.stringify(url("export const themeUrl=x=>'/themes/'+encodeURIComponent(x);")));
const { default: sitemap } = await import(url(source));
test('cache refresh timestamps are not misrepresented as content lastmod', async () => {
  globalThis.sitemapRows = [
    { id: 1, updated_at: '1792858485792' },
    { id: 2, updated_at: 1792858485792 },
  ];
  const rows = await sitemap();
  const xml = resolveSitemap(rows);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.doesNotMatch(xml, /<lastmod>/);
  assert.equal(rows.length, 7);
  assert.equal(rows[5].lastModified, undefined);
});
test('nonempty genres are encoded, deduplicated and count toward the URL budget', async () => {
  globalThis.sitemapGenres = ['Комедия', 'Комедия', 'Драма'];
  globalThis.sitemapRows = [];
  try {
    const rows = await sitemap();
    assert.equal(rows.length, 7);
    assert.equal(
      rows[5].url,
      'https://animonster.su/genres/' + encodeURIComponent('Комедия'),
    );
    assert.equal(globalThis.sitemapLimit, 49993);
  } finally {
    delete globalThis.sitemapGenres;
  }
});
test('one malformed timestamp does not break the remaining URLs or produce Invalid Date', async () => {
  const invalid = [
    null,
    undefined,
    '',
    'garbage',
    'Infinity',
    '8640000000000001',
    0,
    -1,
    NaN,
    Infinity,
    {},
    [],
  ];
  globalThis.sitemapRows = invalid.map((updated_at, index) => ({
    id: index + 1,
    updated_at,
  }));
  const rows = await sitemap();
  const xml = resolveSitemap(rows);
  assert.equal(rows.length, invalid.length + 5);
  assert.doesNotMatch(xml, /<lastmod>|Invalid|NaN/);
  assert.equal((xml.match(/<loc>/g) || []).length, invalid.length + 5);
});
test('the 50,000 URL limit includes static pages and database failure is propagated', async () => {
  globalThis.sitemapRows = Array.from({ length: 50000 }, (_, i) => ({
    id: i + 1,
    updated_at: '1792858485792',
  }));
  assert.equal((await sitemap()).length, 50000);
  assert.equal(globalThis.sitemapLimit, 49995);
  globalThis.sitemapFailure = true;
  try {
    await assert.rejects(sitemap(), /Unavailable/);
  } finally {
    delete globalThis.sitemapFailure;
    delete globalThis.sitemapRows;
    delete globalThis.sitemapLimit;
  }
});
