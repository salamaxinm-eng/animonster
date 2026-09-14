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
    return {
      query: (source, params = []) => sql.unsafe(source, params),
      close: () => sql.end(),
    };
  }
  const engine = new PGlite();
  const migrations = (await fs.readdir('migrations/postgres'))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  for (const name of migrations)
    await engine.exec(await fs.readFile(`migrations/postgres/${name}`, 'utf8'));
  return {
    query: async (source, params = []) =>
      (await engine.query(source, params)).rows,
    close: () => engine.close(),
  };
}

test('one invite can create only one account under concurrency', async () => {
  const db = await database();
  const admin = crypto.randomUUID();
  const invite = `AM-${crypto.randomUUID().slice(0, 12).toUpperCase()}`;
  await db.query(
    'INSERT INTO users(id,identity,nick,role,email_verified,created_at) VALUES ($1,$2,$3,$4,$5,$6)',
    [
      admin,
      `test:${admin}`,
      `admin_${admin.slice(0, 8)}`,
      'admin',
      1,
      Date.now(),
    ],
  );
  await db.query(
    'INSERT INTO invites(hash,label,created_by,created_at,expires_at) VALUES ($1,$2,$3,$4,$5)',
    [sha(invite), 'test', admin, Date.now(), Date.now() + 600_000],
  );
  const claim = async () => {
    const id = crypto.randomUUID();
    return db.query(
      `WITH claimed AS (
      UPDATE invites SET used_by=$1,used_at=$2 WHERE hash=$3 AND used_by IS NULL AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>$4) RETURNING hash
    ) INSERT INTO users(id,identity,email,password_hash,nick,created_at)
      SELECT $5,$6,$7,$8,$9,$10 FROM claimed RETURNING id`,
      [
        id,
        Date.now(),
        sha(invite),
        Date.now(),
        id,
        `email:${id}@test.local`,
        `${id}@test.local`,
        'hash',
        `user_${id.slice(0, 8)}`,
        Date.now(),
      ],
    );
  };
  const results = await Promise.all([claim(), claim()]);
  assert.equal(results.filter((result) => result.length === 1).length, 1);
  await db.close();
});

test('database rejects unknown roles', async () => {
  const db = await database();
  const id = crypto.randomUUID();
  await assert.rejects(() =>
    db.query(
      'INSERT INTO users(id,identity,nick,role,created_at) VALUES ($1,$2,$3,$4,$5)',
      [id, `bad:${id}`, `bad_${id.slice(0, 8)}`, 'owner', Date.now()],
    ),
  );
  await db.close();
});

test('administrator role and Plus grant persist', async () => {
  const db = await database();
  const adminId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const now = Date.now();
  await db.query(
    'INSERT INTO users(id,identity,nick,role,email_verified,created_at) VALUES ($1,$2,$3,$4,$5,$6)',
    [
      adminId,
      `test:${adminId}`,
      `admin_${adminId.slice(0, 8)}`,
      'admin',
      1,
      now,
    ],
  );
  await db.query(
    'INSERT INTO users(id,identity,nick,role,email_verified,created_at) VALUES ($1,$2,$3,$4,$5,$6)',
    [userId, `test:${userId}`, `user_${userId.slice(0, 8)}`, 'user', 1, now],
  );
  await db.query('UPDATE users SET role=$1 WHERE id=$2', ['moderator', userId]);
  await db.query(
    'INSERT INTO grants(order_id,user_id,starts_at,expires,created_by,reason) VALUES ($1,$2,$3,$4,$5,$6)',
    [
      `test:${crypto.randomUUID()}`,
      userId,
      now,
      now + 31 * 86400000,
      adminId,
      'test',
    ],
  );
  const rows = await db.query(
    'SELECT u.role,MAX(g.expires) AS premium_until FROM users u JOIN grants g ON g.user_id=u.id WHERE u.id=$1 GROUP BY u.role',
    [userId],
  );
  assert.equal(rows[0].role, 'moderator');
  assert.ok(Number(rows[0].premium_until) > now);
  await db.close();
});

test('custom collection lists keep their own items and cascade on delete', async () => {
  const db = await database();
  const userId = crypto.randomUUID();
  const listId = crypto.randomUUID();
  const now = Date.now();
  await db.query(
    'INSERT INTO users(id,identity,nick,created_at) VALUES ($1,$2,$3,$4)',
    [userId, `test:${userId}`, `user_${userId.slice(0, 8)}`, now],
  );
  await db.query(
    'INSERT INTO collection_lists(id,user_id,name,created_at,slot) VALUES ($1,$2,$3,$4,$5)',
    [listId, userId, 'На выходные', now, 1],
  );
  await db.query(
    'INSERT INTO collection_list_items(list_id,anime_id) VALUES ($1,$2)',
    [listId, 42],
  );
  assert.equal(
    Number(
      (
        await db.query(
          'SELECT count(*) AS n FROM collection_list_items WHERE list_id=$1',
          [listId],
        )
      )[0].n,
    ),
    1,
  );
  await db.query('DELETE FROM collection_lists WHERE id=$1', [listId]);
  assert.equal(
    Number(
      (
        await db.query(
          'SELECT count(*) AS n FROM collection_list_items WHERE list_id=$1',
          [listId],
        )
      )[0].n,
    ),
    0,
  );
  await db.close();
});

test('playback preference and one skip override per voiceover persist', async () => {
  const databaseClient = await database();
  const userId = crypto.randomUUID();
  const now = Date.now();
  await databaseClient.query(
    'INSERT INTO users(id,identity,nick,created_at,auto_skip_segments) VALUES ($1,$2,$3,$4,$5)',
    [userId, `test:${userId}`, `user_${userId.slice(0, 8)}`, now, 1],
  );
  await databaseClient.query(
    'INSERT INTO skip_time_overrides(id,anime_id,episode,voiceover,opening_start,opening_stop,created_by,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [crypto.randomUUID(), 34572, 1, 'kodik:77', 90, 180, userId, now],
  );
  const rows = await databaseClient.query(
    'SELECT auto_skip_segments FROM users WHERE id=$1',
    [userId],
  );
  assert.equal(rows[0].auto_skip_segments, 1);
  await assert.rejects(() =>
    databaseClient.query(
      'INSERT INTO skip_time_overrides(id,anime_id,episode,voiceover,opening_start,opening_stop,created_by,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [crypto.randomUUID(), 34572, 1, 'kodik:77', 95, 185, userId, now],
    ),
  );
  await assert.rejects(() =>
    databaseClient.query('UPDATE users SET auto_skip_segments=2 WHERE id=$1', [
      userId,
    ]),
  );
  await databaseClient.close();
});

test('recommendation cache is empty-safe and isolated per user', async () => {
  const databaseClient = await database();
  const firstUser = crypto.randomUUID();
  const secondUser = crypto.randomUUID();
  const emptyUser = crypto.randomUUID();
  const timestamp = Date.now();
  for (const id of [firstUser, secondUser, emptyUser])
    await databaseClient.query(
      'INSERT INTO users(id,identity,nick,created_at) VALUES ($1,$2,$3,$4)',
      [id, `test:${id}`, `user_${id.slice(0, 8)}`, timestamp],
    );
  for (const animeId of [101, 202])
    await databaseClient.query(
      "INSERT INTO anime_cache(id,data,episodes,updated_at) VALUES ($1,$2,'[]',$3)",
      [animeId, JSON.stringify({ id: animeId }), timestamp],
    );
  await databaseClient.query(
    'INSERT INTO user_recommendations(user_id,anime_id,score,reason,source,algorithm_version,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7),($8,$9,$10,$11,$12,$13,$14)',
    [
      firstUser,
      101,
      0.8,
      'first',
      'personal',
      1,
      timestamp,
      secondUser,
      202,
      0.7,
      'second',
      'quality',
      1,
      timestamp,
    ],
  );
  const firstRows = await databaseClient.query(
    'SELECT anime_id FROM user_recommendations WHERE user_id=$1 ORDER BY score DESC LIMIT 20',
    [firstUser],
  );
  const emptyRows = await databaseClient.query(
    'SELECT anime_id FROM user_recommendations WHERE user_id=$1 ORDER BY score DESC LIMIT 20',
    [emptyUser],
  );
  assert.deepEqual(
    firstRows.map((row) => Number(row.anime_id)),
    [101],
  );
  assert.deepEqual(emptyRows, []);
  await databaseClient.close();
});

test('failed recommendation work stays dirty without affecting the site', async () => {
  const databaseClient = await database();
  const userId = crypto.randomUUID();
  const timestamp = Date.now();
  await databaseClient.query(
    'INSERT INTO users(id,identity,nick,created_at) VALUES ($1,$2,$3,$4)',
    [userId, `test:${userId}`, `user_${userId.slice(0, 8)}`, timestamp],
  );
  await databaseClient.query(
    'INSERT INTO user_recommendation_state(user_id,dirty,dirty_at,last_error) VALUES ($1,1,$2,$3)',
    [userId, timestamp, 'test failure'],
  );
  const state = await databaseClient.query(
    'SELECT dirty,last_error FROM user_recommendation_state WHERE user_id=$1',
    [userId],
  );
  assert.equal(state[0].dirty, 1);
  assert.equal(state[0].last_error, 'test failure');
  await databaseClient.close();
});

test('Plus episode availability and reactions are idempotent', async () => {
  const databaseClient = await database();
  const userId = crypto.randomUUID();
  const commentId = crypto.randomUUID();
  const timestamp = Date.now();
  await databaseClient.query(
    'INSERT INTO users(id,identity,nick,created_at) VALUES ($1,$2,$3,$4)',
    [userId, `test:${userId}`, `user_${userId.slice(0, 8)}`, timestamp],
  );
  await databaseClient.query(
    'INSERT INTO comments(id,scope,author_id,body,created_at) VALUES ($1,$2,$3,$4,$5)',
    [commentId, 'anime:42', userId, 'test', timestamp],
  );
  await databaseClient.query(
    'INSERT INTO episode_availability(anime_id,provider,episode,first_seen_at,free_at) VALUES ($1,$2,$3,$4,$5)',
    [42, 'aniliberty', 1, timestamp, timestamp + 4 * 3600000],
  );
  const access = await databaseClient.query(
    'SELECT free_at-first_seen_at AS delay FROM episode_availability WHERE anime_id=$1 AND episode=$2',
    [42, 1],
  );
  assert.equal(Number(access[0].delay), 4 * 3600000);
  await databaseClient.query(
    'INSERT INTO comment_reactions(comment_id,user_id,reaction,created_at) VALUES ($1,$2,$3,$4)',
    [commentId, userId, 'fire', timestamp],
  );
  await assert.rejects(() =>
    databaseClient.query(
      'INSERT INTO comment_reactions(comment_id,user_id,reaction,created_at) VALUES ($1,$2,$3,$4)',
      [commentId, userId, 'fire', timestamp],
    ),
  );
  await assert.rejects(() =>
    databaseClient.query(
      'INSERT INTO comment_reactions(comment_id,user_id,reaction,created_at) VALUES ($1,$2,$3,$4)',
      [commentId, userId, 'unknown', timestamp],
    ),
  );
  await databaseClient.close();
});

test('Kodik sources preserve one canonical episode access clock', async () => {
  const databaseClient = await database();
  const timestamp = Date.now();
  const anime = {
    id: 5114,
    russian: 'Стальной алхимик',
    name: 'Fullmetal Alchemist',
    image: { original: 'https://shikimori.one/poster.jpg' },
    score: '9.1',
    kind: 'tv',
    episodes: 64,
    aired_on: '2009',
    genres: ['Экшен'],
    providers: ['kodik'],
    primary_provider: 'kodik',
  };
  await databaseClient.query(
    `INSERT INTO anime_cache(id,data,episodes,updated_at,primary_provider,search_text,kind_index,status_index,year_index,score_index,genres_index)
     VALUES ($1,$2,$3,$4,'kodik',$5,'tv','released',2009,9.1,$6)`,
    [5114, JSON.stringify(anime), '[]', timestamp, 'стальной алхимик fullmetal alchemist', JSON.stringify(['Экшен'])],
  );
  await databaseClient.query(
    `INSERT INTO anime_sources(provider,source_id,anime_id,shikimori_id,translation_id,translation_title,translation_type,player_url,episodes_count,last_seen_at)
     VALUES ('kodik','source-1',$1,$1,77,'Тест','voice','https://kodik.info/video/1',64,$2)`,
    [5114, timestamp],
  );
  await databaseClient.query(
    'INSERT INTO anime_episode_availability(anime_id,episode,first_seen_at,free_at) VALUES ($1,1,$2,$3) ON CONFLICT DO NOTHING',
    [5114, timestamp, timestamp + 4 * 3600000],
  );
  await databaseClient.query(
    'INSERT INTO anime_episode_availability(anime_id,episode,first_seen_at,free_at) VALUES ($1,1,$2,$2) ON CONFLICT DO NOTHING',
    [5114, timestamp + 1000],
  );
  const rows = await databaseClient.query(
    'SELECT first_seen_at,free_at FROM anime_episode_availability WHERE anime_id=$1 AND episode=1',
    [5114],
  );
  assert.equal(Number(rows[0].first_seen_at), timestamp);
  assert.equal(Number(rows[0].free_at), timestamp + 4 * 3600000);
  await databaseClient.close();
});

test('free custom-list slots cannot exceed the server limit under concurrency', async () => {
  const databaseClient = await database();
  const userId = crypto.randomUUID();
  const timestamp = Date.now();
  await databaseClient.query(
    'INSERT INTO users(id,identity,nick,created_at) VALUES ($1,$2,$3,$4)',
    [userId, `test:${userId}`, `user_${userId.slice(0, 8)}`, timestamp],
  );
  await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      databaseClient.query(
        `INSERT INTO collection_lists(id,user_id,name,created_at,slot)
         SELECT $1,$2,$3,$4,candidate.slot FROM generate_series(1,3) AS candidate(slot)
         WHERE (SELECT count(*) FROM collection_lists existing WHERE existing.user_id=$5)<3
         AND NOT EXISTS(SELECT 1 FROM collection_lists l WHERE l.user_id=$6 AND l.slot=candidate.slot)
         ORDER BY candidate.slot LIMIT 1 ON CONFLICT DO NOTHING`,
        [
          crypto.randomUUID(),
          userId,
          `list-${index}`,
          timestamp + index,
          userId,
          userId,
        ],
      ),
    ),
  );
  const rows = await databaseClient.query(
    'SELECT count(*) AS count FROM collection_lists WHERE user_id=$1',
    [userId],
  );
  assert.ok(Number(rows[0].count) <= 3);
  await databaseClient.close();
});
