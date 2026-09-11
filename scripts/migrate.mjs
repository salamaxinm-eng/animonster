import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
try {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at bigint NOT NULL)`;
  const directory = path.resolve('migrations/postgres');
  const names = (await fs.readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
  for (const name of names) {
    const applied = await sql`SELECT 1 FROM schema_migrations WHERE name=${name}`;
    if (applied.length) continue;
    const source = await fs.readFile(path.join(directory, name), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(source);
      await tx`INSERT INTO schema_migrations (name, applied_at) VALUES (${name}, ${Date.now()})`;
    });
    process.stdout.write(`Applied ${name}\n`);
  }
} finally {
  await sql.end();
}
