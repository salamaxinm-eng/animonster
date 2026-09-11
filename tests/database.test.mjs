import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import postgres from 'postgres';
import { PGlite } from '@electric-sql/pglite';

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');

async function database() {
  if (process.env.TEST_DATABASE_URL) {
    const sql = postgres(process.env.TEST_DATABASE_URL, { max: 2 });
    return { query: (source, params = []) => sql.unsafe(source, params), close: () => sql.end() };
  }
  const engine = new PGlite();
  await engine.exec(await fs.readFile('migrations/postgres/0001_initial.sql', 'utf8'));
  return { query: async (source, params = []) => (await engine.query(source, params)).rows, close: () => engine.close() };
}

test('one invite can create only one account under concurrency', async () => {
  const db = await database();
  const admin = crypto.randomUUID();
  const invite = `AM-${crypto.randomUUID().slice(0, 12).toUpperCase()}`;
  await db.query('INSERT INTO users(id,identity,nick,role,email_verified,created_at) VALUES ($1,$2,$3,$4,$5,$6)', [admin, `test:${admin}`, `admin_${admin.slice(0, 8)}`, 'admin', 1, Date.now()]);
  await db.query('INSERT INTO invites(hash,label,created_by,created_at,expires_at) VALUES ($1,$2,$3,$4,$5)', [sha(invite), 'test', admin, Date.now(), Date.now() + 600_000]);
  const claim = async () => {
    const id = crypto.randomUUID();
    return db.query(`WITH claimed AS (
      UPDATE invites SET used_by=$1,used_at=$2 WHERE hash=$3 AND used_by IS NULL AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>$4) RETURNING hash
    ) INSERT INTO users(id,identity,email,password_hash,nick,created_at)
      SELECT $5,$6,$7,$8,$9,$10 FROM claimed RETURNING id`, [id, Date.now(), sha(invite), Date.now(), id, `email:${id}@test.local`, `${id}@test.local`, 'hash', `user_${id.slice(0, 8)}`, Date.now()]);
  };
  const results = await Promise.all([claim(), claim()]);
  assert.equal(results.filter((result) => result.length === 1).length, 1);
  await db.close();
});

test('database rejects unknown roles', async () => {
  const db = await database();
  const id = crypto.randomUUID();
  await assert.rejects(() => db.query('INSERT INTO users(id,identity,nick,role,created_at) VALUES ($1,$2,$3,$4,$5)', [id, `bad:${id}`, `bad_${id.slice(0, 8)}`, 'owner', Date.now()]));
  await db.close();
});

test('administrator role and Plus grant persist', async () => {
  const db = await database();
  const adminId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const now = Date.now();
  await db.query('INSERT INTO users(id,identity,nick,role,email_verified,created_at) VALUES ($1,$2,$3,$4,$5,$6)', [adminId, `test:${adminId}`, `admin_${adminId.slice(0, 8)}`, 'admin', 1, now]);
  await db.query('INSERT INTO users(id,identity,nick,role,email_verified,created_at) VALUES ($1,$2,$3,$4,$5,$6)', [userId, `test:${userId}`, `user_${userId.slice(0, 8)}`, 'user', 1, now]);
  await db.query('UPDATE users SET role=$1 WHERE id=$2', ['moderator', userId]);
  await db.query('INSERT INTO grants(order_id,user_id,starts_at,expires,created_by,reason) VALUES ($1,$2,$3,$4,$5,$6)', [`test:${crypto.randomUUID()}`, userId, now, now + 31 * 86400000, adminId, 'test']);
  const rows = await db.query('SELECT u.role,MAX(g.expires) AS premium_until FROM users u JOIN grants g ON g.user_id=u.id WHERE u.id=$1 GROUP BY u.role', [userId]);
  assert.equal(rows[0].role, 'moderator');
  assert.ok(Number(rows[0].premium_until) > now);
  await db.close();
});
