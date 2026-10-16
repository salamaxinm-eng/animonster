import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { stripTypeScriptTypes } from 'node:module';

await test('all legacy selections display Eclipse; choices made after the release persist', async () => {
  const source = stripTypeScriptTypes(await readFile(new URL('../lib/community.ts', import.meta.url), 'utf8'));
  const { resolveSiteTheme, themes } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  for (const previous of [null, undefined, '', 'neon', 'sakura', 'mage', 'cyber', 'bleach', 'unknown'])
    assert.equal(resolveSiteTheme(previous), 'eclipse');
  for (const theme of themes) assert.equal(resolveSiteTheme(theme.id), theme.id);
  assert.equal(themes.find(theme => theme.id === 'v2-bleach').cosmetic, 'bleach-theme');
});

await test('Eclipse becomes the account default without changing saved themes or cosmetics', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE users (
      id text PRIMARY KEY, theme text NOT NULL DEFAULT 'neon', pin text, profile_background text
    );
    INSERT INTO users(id,theme,pin,profile_background) VALUES
      ('green','neon','earned-pin','owned-background'),
      ('pink','sakura',NULL,NULL), ('mage','mage',NULL,NULL),
      ('blue','cyber',NULL,NULL), ('bleach','bleach',NULL,NULL);`);
    const before = (await db.query('SELECT * FROM users ORDER BY id')).rows;
    await db.exec(await readFile(new URL('../migrations/postgres/0056_eclipse_default.sql', import.meta.url), 'utf8'));
    assert.deepEqual((await db.query('SELECT * FROM users ORDER BY id')).rows, before);
    await db.exec("INSERT INTO users(id) VALUES ('new')");
    assert.equal((await db.query("SELECT theme FROM users WHERE id='new'")).rows[0].theme, 'eclipse');
  } finally {
    await db.close();
  }
});
