import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import sharp from 'sharp';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';

const moduleUrl = (source) => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
function database(engine) {
  return {
    prepare(source) { let values = [], n = 0; const sql = source.replace(/\?/g, () => '$' + ++n); return {
      bind(...args) { values = args; return this; },
      async first() { return (await engine.query(sql, values)).rows[0] ?? null; },
      async all() { return { results: (await engine.query(sql, values)).rows }; },
      async run() { return engine.query(sql, values); },
    }; },
    transaction(fn) { return engine.transaction((tx) => fn(database(tx))); },
  };
}
const stubCore = moduleUrl('export const db=()=>globalThis.cosmeticTestDb; export const now=()=>1000; export const uid=()=>crypto.randomUUID(); export class ApiError extends Error { constructor(message,status=400){super(message);this.status=status;} }');
const source = stripTypeScriptTypes(await readFile('lib/server/cosmetic-generator.ts', 'utf8'))
  .replaceAll("'./core'", JSON.stringify(stubCore)).replaceAll("'sharp'", JSON.stringify(import.meta.resolve('sharp')));
const service = await import(moduleUrl(source));

void test('motifs differ by rarity and generated pin keeps transparent silhouette', async () => {
  assert.notEqual(service.generationConcept('Наруто', 'common'), service.generationConcept('Наруто', 'legendary'));
  assert.match(service.generationPrompt({ anime: 'Наруто', kind: 'frame', rarity: 'legendary', idea: 'Курама' }), /transparent circular center/);
  const raw = Buffer.alloc(1024 * 1024 * 4);
  for (let p = 0; p < 1024 * 1024; p++) { raw[p * 4] = 5; raw[p * 4 + 1] = 5; raw[p * 4 + 2] = 5; raw[p * 4 + 3] = 255; }
  for (let y = 250; y < 760; y++) for (let x = 250; x < 760; x++) { const p = (y * 1024 + x) * 4; raw[p] = 230; raw[p + 1] = 110; raw[p + 2] = 50; }
  const input = await sharp(raw, { raw: { width: 1024, height: 1024, channels: 4 } }).png().toBuffer();
  const result = await service.prepareGeneratedImage(input, 'pin');
  const meta = await sharp(result.full).metadata();
  assert.equal(meta.width, 512); assert.equal(meta.height, 512);
  const { data } = await sharp(result.full).raw().toBuffer({ resolveWithObject: true });
  assert.equal(data[3], 0); assert.equal(data[(256 * 512 + 256) * 4 + 3], 255);
  assert.equal((await sharp(result.thumb).metadata()).width, 128);
});

void test('frame center is transparent; publish and grant are idempotent', async () => {
  const raw = Buffer.alloc(1024 * 1024 * 4);
  for (let y = 0; y < 1024; y++) for (let x = 0; x < 1024; x++) {
    const p = (y * 1024 + x) * 4, radius = Math.hypot(x - 512, y - 512);
    raw[p] = 180; raw[p + 1] = 75; raw[p + 2] = 40; raw[p + 3] = radius > 315 && radius < 470 ? 255 : 0;
  }
  const input = await sharp(raw, { raw: { width: 1024, height: 1024, channels: 4 } }).png().toBuffer();
  const { full, thumb } = await service.prepareGeneratedImage(input, 'frame');
  const { data } = await sharp(full).raw().toBuffer({ resolveWithObject: true });
  assert.equal(data[(512 * 1024 + 512) * 4 + 3], 0);
  assert.equal(data[(512 * 1024 + 920) * 4 + 3], 255);
  const engine = new PGlite({ extensions: { pg_trgm } });
  globalThis.cosmeticTestDb = database(engine);
  try {
    for (const name of (await readdir('migrations/postgres')).filter((s) => s.endsWith('.sql')).sort()) await engine.exec(await readFile('migrations/postgres/' + name, 'utf8'));
    await engine.exec("INSERT INTO users(id,identity,nick,role,created_at) VALUES ('admin','test:admin','Admin','admin',0),('user','test:user','User','user',0)");
    const id = crypto.randomUUID();
    await engine.query(`INSERT INTO cosmetic_generations(id,batch_id,actor_id,anime,kind,rarity,concept,prompt,model,full_png,thumb_png,created_at)
      VALUES($1,$2,'admin','Блич','frame','legendary','маска Пустого','prompt','test',$3,$4,0)`, [id, id, full, thumb]);
    const first = await service.publishCosmetic('admin', id);
    const second = await service.publishCosmetic('admin', id);
    assert.equal(first.cosmeticId, second.cosmeticId);
    await service.grantGeneratedCosmetic('admin', id, 'user');
    await service.grantGeneratedCosmetic('admin', id, 'user');
    assert.equal((await engine.query("SELECT count(*)::int n FROM user_cosmetics WHERE user_id='user'")).rows[0].n, 1);
    assert.equal((await engine.query("SELECT access_type,image FROM cosmetics WHERE id=$1", [first.cosmeticId])).rows[0].access_type, 'admin');
  } finally { await engine.close(); delete globalThis.cosmeticTestDb; }
});
