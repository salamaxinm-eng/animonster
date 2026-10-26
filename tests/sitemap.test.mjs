import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import { resolveSitemap } from 'next/dist/build/webpack/loaders/metadata/resolve-route-data.js';
const url = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const library = url(`export async function sitemapAnime(limit) { globalThis.sitemapLimit=limit; if(globalThis.sitemapFailure) throw new Error('Unavailable');return globalThis.sitemapRows.slice(0,limit); }`);
const source = stripTypeScriptTypes(await readFile('app/sitemap.ts', 'utf8')).replace("'@/lib/server/library'", JSON.stringify(library));
const { default: sitemap } = await import(url(source));
test('PostgreSQL bigint strings serialize into valid sitemap XML through the real Next serializer', async () => {
 globalThis.sitemapRows=[{id:1,updated_at:'1792858485792'},{id:2,updated_at:1792858485792}];
 const rows=await sitemap();const xml=resolveSitemap(rows);
 assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
 assert.match(xml,/<lastmod>2026-10-24T16:14:45.792Z<\/lastmod>/);
 assert.equal((xml.match(/<lastmod>/g)||[]).length,2);
 assert.equal(rows.length,6);
 assert.equal(rows[4].lastModified.toISOString(),rows[5].lastModified.toISOString());
});
test('one malformed timestamp does not break the remaining URLs or produce Invalid Date', async () => {
 const invalid=[null,undefined,'','garbage','Infinity','8640000000000001',0,-1,NaN,Infinity,{},[]];
 globalThis.sitemapRows=invalid.map((updated_at,index)=>({id:index+1,updated_at}));
 const rows=await sitemap();const xml=resolveSitemap(rows);
 assert.equal(rows.length,invalid.length+4);
 assert.doesNotMatch(xml,/<lastmod>|Invalid|NaN/);
 assert.equal((xml.match(/<loc>/g)||[]).length,invalid.length+4);
});
test('the 50,000 URL limit includes static pages and database failure preserves those pages', async () => {
 globalThis.sitemapRows=Array.from({length:50000},(_,i)=>({id:i+1,updated_at:'1792858485792'}));
 assert.equal((await sitemap()).length,50000);assert.equal(globalThis.sitemapLimit,49996);
 globalThis.sitemapFailure=true;
 try {assert.equal((await sitemap()).length,4);} finally {delete globalThis.sitemapFailure;delete globalThis.sitemapRows;delete globalThis.sitemapLimit;}
});
