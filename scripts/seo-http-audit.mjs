import { mkdir, writeFile } from 'node:fs/promises';
const origin = process.argv[2] || 'https://animonster.su';
const folder = process.argv[3] || 'work/seo-audit';
await mkdir(folder, { recursive: true });
const rows = [];
for (const path of ['/', '/catalog', '/catalog?page=2', '/genres', '/genres/' + encodeURIComponent('Комедия'), '/genres/unknown-seo-genre', '/anime/21', '/anime/1', '/anime/invalid_seo_id', '/anime/999999999', '/search?q=test', '/recommendations', '/robots.txt', '/sitemap.xml']) {
  try {
    const start = performance.now();
    const response = await fetch(origin + path, { signal: AbortSignal.timeout(25000) });
    const ttfb = Math.round(performance.now() - start);
    const html = await response.text();
    const visible = html.replace(/<script[\s\S]*?<\/script>/g, '');
    const row = { path, status: response.status, url: response.url, ttfb, bytes: Buffer.byteLength(html), title: html.match(/<title>(.*?)<\/title>/s)?.[1], h1: [...visible.matchAll(/<h1[^>]*>(.*?)<\/h1>/gs)].map(m => m[1]), canonical: html.match(/<link[^>]*rel="canonical"[^>]*>/)?.[0], description: html.match(/<meta[^>]*name="description"[^>]*>/)?.[0], robots: [...html.matchAll(/<meta[^>]*name="robots"[^>]*>/g)].map(m=>m[0]), animeLinks: (visible.match(/href="\/anime\//g)||[]).length, jsonLd: [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(m=>JSON.parse(m[1])), urls: (html.match(/<loc>/g)||[]).length, cache: response.headers.get('cache-control') };
    rows.push(row);
    await writeFile(`${folder}/${rows.length}.html`, html);
    console.log(JSON.stringify(row));
  } catch (error) { rows.push({ path, error: error.message }); console.log(path, error.message); }
}
await writeFile(`${folder}/results.json`, JSON.stringify(rows, null, 2));
