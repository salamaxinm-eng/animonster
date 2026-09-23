import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import postgres from 'postgres';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');

async function database() {
  if (process.env.TEST_DATABASE_URL) {
    const sql = postgres(process.env.TEST_DATABASE_URL, { max: 2 });
    return {
      query: (source, params = []) => sql.unsafe(source, params),
      close: () => sql.end(),
    };
  }
  const engine = new PGlite({ extensions: { pg_trgm } });
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
    [
      5114,
      JSON.stringify(anime),
      '[]',
      timestamp,
      'стальной алхимик fullmetal alchemist',
      JSON.stringify(['Экшен']),
    ],
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

test('Kodik repair migration retries missing posters and restores primary provider', async () => {
  const databaseClient = await database();
  const timestamp = Date.now();
  await databaseClient.query(
    `INSERT INTO kodik_match_queue(source_id,title,reason,payload,status,updated_at)
     VALUES ($1,$2,$3,$4,'pending',$5),($6,$7,$8,$9,'pending',$10)`,
    [
      'poster-retry',
      'Poster retry',
      'Недостаточно метаданных или отсутствует HTTPS-постер',
      '{}',
      timestamp,
      'manual-review',
      'Manual review',
      'Нет однозначного совпадения Shikimori',
      '{}',
      timestamp,
    ],
  );
  await databaseClient.query(
    `INSERT INTO anime_cache(id,data,episodes,updated_at,primary_provider)
     VALUES ($1,$2,'[]',$3,'aniliberty')`,
    [
      25,
      JSON.stringify({
        id: 25,
        name: 'Fallback title',
        primary_provider: 'aniliberty',
        providers: ['aniliberty'],
      }),
      timestamp,
    ],
  );
  await databaseClient.query(
    `INSERT INTO anime_sources(provider,source_id,anime_id,last_seen_at)
     VALUES ('kodik','primary-repair',$1,$2)`,
    [25, timestamp],
  );
  const repairMigration = await fs.readFile(
    'migrations/postgres/0012_repair_kodik_catalog.sql',
    'utf8',
  );
  for (const statement of repairMigration.split(';').map((part) => part.trim()))
    if (statement) await databaseClient.query(statement);
  const rows = await databaseClient.query(
    'SELECT source_id,reason FROM kodik_match_queue ORDER BY source_id',
  );
  assert.deepEqual(
    rows.map((row) => [row.source_id, row.reason]),
    [
      ['manual-review', 'Нет однозначного совпадения Shikimori'],
      ['poster-retry', 'Ожидает автоматического сопоставления'],
    ],
  );
  const repaired = (
    await databaseClient.query(
      'SELECT data,primary_provider FROM anime_cache WHERE id=$1',
      [25],
    )
  )[0];
  assert.equal(repaired.primary_provider, 'kodik');
  assert.equal(JSON.parse(repaired.data).primary_provider, 'kodik');
  assert.deepEqual(JSON.parse(repaired.data).providers, [
    'kodik',
    'aniliberty',
  ]);
  const counts = (
    await databaseClient.query(
      `SELECT count(DISTINCT anime_id) AS imported,
       count(DISTINCT anime_id) FILTER (WHERE COALESCE((SELECT data::jsonb->'providers' FROM anime_cache WHERE id=anime_sources.anime_id),'[]'::jsonb) @> '["aniliberty"]'::jsonb) AS merged,
       count(DISTINCT anime_id) FILTER (WHERE NOT (COALESCE((SELECT data::jsonb->'providers' FROM anime_cache WHERE id=anime_sources.anime_id),'[]'::jsonb) @> '["aniliberty"]'::jsonb)) AS kodik_only
       FROM anime_sources WHERE provider='kodik' AND active=1`,
    )
  )[0];
  assert.equal(Number(counts.imported), 1);
  assert.equal(Number(counts.merged), 1);
  assert.equal(Number(counts.kodik_only), 0);
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

test('search metadata supports normalized aliases and typo ranking', async () => {
  const databaseClient = await database();
  const timestamp = Date.now();
  const anime = {
    id: 16498,
    russian: 'Атака титанов',
    name: 'Shingeki no Kyojin',
    image: { original: '/poster.jpg' },
    score: '8.5',
    kind: 'tv',
    status: 'released',
    episodes: 25,
    aired_on: '2013',
  };
  await databaseClient.query(
    `INSERT INTO anime_cache(id,data,episodes,updated_at,search_text,kind_index,status_index,year_index,score_index)
     VALUES ($1,$2,'[]',$3,$4,'tv','released',2013,8.5)`,
    [
      anime.id,
      JSON.stringify(anime),
      timestamp,
      'атака титанов shingeki no kyojin',
    ],
  );
  await databaseClient.query(
    `INSERT INTO anime_search_metadata(anime_id,aliases,normalized_aliases,normalized_titles,status)
     VALUES ($1,$2::jsonb,$3::text[],$4,'ok')`,
    [
      anime.id,
      JSON.stringify([
        'Атака титанов',
        'Shingeki no Kyojin',
        'Вторжение гигантов',
      ]),
      ['атака титанов', 'shingeki no kyojin', 'вторжение гигантов'],
      'атака титанов shingeki no kyojin вторжение гигантов',
    ],
  );
  const exact = await databaseClient.query(
    `SELECT max(CASE WHEN alias=$1 THEN 1000 WHEN alias LIKE $2 THEN 800 ELSE similarity(alias,$1)*300 END) AS relevance
     FROM anime_search_metadata,unnest(normalized_aliases) alias WHERE anime_id=$3`,
    ['атака титанов', 'атака титанов%', anime.id],
  );
  const typo = await databaseClient.query(
    `SELECT max(similarity(alias,$1)) AS relevance
     FROM anime_search_metadata,unnest(normalized_aliases) alias WHERE anime_id=$2`,
    ['атака титановв', anime.id],
  );
  assert.equal(Number(exact[0].relevance), 1000);
  assert.ok(Number(typo[0].relevance) >= 0.28);

  await databaseClient.query(
    `UPDATE anime_cache SET genres_index=$1::jsonb WHERE id=$2`,
    [JSON.stringify(['Экшен', 'Драма']), anime.id],
  );
  await databaseClient.query(
    `UPDATE anime_search_metadata SET themes=$1::jsonb WHERE anime_id=$2`,
    [JSON.stringify(['Военное', 'Выживание']), anime.id],
  );
  const filtered = await databaseClient.query(
    `SELECT count(*) AS total FROM anime_cache a
     JOIN anime_search_metadata m ON m.anime_id=a.id
     WHERE a.genres_index @> $1::jsonb AND m.themes @> $2::jsonb
     AND a.kind_index='tv' AND a.status_index='released'`,
    [JSON.stringify(['Экшен', 'Драма']), JSON.stringify(['Военное'])],
  );
  const missingCombination = await databaseClient.query(
    `SELECT count(*) AS total FROM anime_cache a
     JOIN anime_search_metadata m ON m.anime_id=a.id
     WHERE a.genres_index @> $1::jsonb AND m.themes @> $2::jsonb`,
    [JSON.stringify(['Экшен', 'Комедия']), JSON.stringify(['Военное'])],
  );
  await databaseClient.query(
    `UPDATE anime_search_metadata SET themes='[]'::jsonb WHERE anime_id=$1`,
    [anime.id],
  );
  await databaseClient.query(
    `INSERT INTO anime_themes_cache(anime_id,themes,status,checked_at)
     VALUES ($1,$2,'ok',$3)`,
    [anime.id, JSON.stringify(['Путешествие во времени']), timestamp],
  );
  const cachedTheme = await databaseClient.query(
    `SELECT count(*) AS total FROM anime_cache a
     JOIN anime_search_metadata m ON m.anime_id=a.id
     LEFT JOIN anime_themes_cache t ON t.anime_id=a.id
     WHERE (m.themes || COALESCE(t.themes::jsonb,'[]'::jsonb) || a.genres_index) @> $1::jsonb`,
    [JSON.stringify(['Путешествие во времени'])],
  );
  assert.equal(Number(filtered[0].total), 1);
  assert.equal(Number(missingCombination[0].total), 0);
  assert.equal(Number(cachedTheme[0].total), 1);
  await databaseClient.close();
});

test('achievements unlock once at 100 episodes including One Piece', async () => {
  const databaseClient = await database();
  const userId = crypto.randomUUID();
  const timestamp = Date.now();
  await databaseClient.query(
    'INSERT INTO users(id,identity,nick,created_at) VALUES ($1,$2,$3,$4)',
    [userId, `test:${userId}`, `ach_${userId.slice(0, 8)}`, timestamp],
  );
  await databaseClient.query(
    `INSERT INTO history(user_id,anime_id,episode,duration,watched_seconds,completed,updated_at)
     SELECT $1,21,episode,1440,720,1,$2 FROM generate_series(1,99) episode`,
    [userId, timestamp],
  );
  const evaluate = () =>
    databaseClient.query(
      `INSERT INTO user_achievements(user_id,achievement_id,unlocked_at)
       SELECT $1,a.id,$2 FROM achievements a WHERE a.active=1 AND
       CASE WHEN a.metric='anime_completed_episodes' THEN
         (SELECT COALESCE(sum(completed),0) FROM history WHERE user_id=$1 AND anime_id=a.anime_id)
       ELSE (SELECT COALESCE(sum(completed),0) FROM history WHERE user_id=$1) END >= a.threshold
       ON CONFLICT DO NOTHING`,
      [userId, timestamp],
    );
  await evaluate();
  let rows = await databaseClient.query(
    `SELECT count(*) AS count FROM user_achievements ua JOIN achievements a ON a.id=ua.achievement_id
     WHERE ua.user_id=$1 AND a.slug IN ('episodes-100','one-piece-100')`,
    [userId],
  );
  assert.equal(Number(rows[0].count), 0);
  await databaseClient.query(
    `INSERT INTO history(user_id,anime_id,episode,duration,watched_seconds,completed,updated_at)
     VALUES ($1,21,100,1440,720,1,$2)`,
    [userId, timestamp],
  );
  await evaluate();
  await evaluate();
  rows = await databaseClient.query(
    `SELECT count(*) AS count FROM user_achievements ua JOIN achievements a ON a.id=ua.achievement_id
     WHERE ua.user_id=$1 AND a.slug IN ('episodes-100','one-piece-100')`,
    [userId],
  );
  assert.equal(Number(rows[0].count), 2);
  await databaseClient.close();
});

test('cosmetic access separates Plus from permanent achievement rewards', async () => {
  const databaseClient = await database();
  const userId = crypto.randomUUID();
  const timestamp = Date.now();
  await databaseClient.query(
    'INSERT INTO users(id,identity,nick,created_at) VALUES ($1,$2,$3,$4)',
    [userId, `test:${userId}`, `cos_${userId.slice(0, 8)}`, timestamp],
  );
  const allowed = async (slug) => {
    const rows = await databaseClient.query(
      `SELECT EXISTS(SELECT 1 FROM cosmetics c WHERE c.slug=$1 AND c.active=1 AND
       (c.access_type='free' OR (c.access_type='plus' AND EXISTS(
         SELECT 1 FROM grants g WHERE g.user_id=$2 AND g.revoked_at IS NULL AND g.expires>$3
       )) OR EXISTS(SELECT 1 FROM user_cosmetics uc WHERE uc.user_id=$2 AND uc.cosmetic_id=c.id))) AS allowed`,
      [slug, userId, timestamp],
    );
    return !!rows[0].allowed;
  };
  assert.equal(await allowed('one-piece'), false);
  assert.equal(await allowed('hundred-episodes'), false);
  await databaseClient.query(
    `INSERT INTO user_cosmetics(user_id,cosmetic_id,unlocked_at,source,source_key)
     VALUES ($1,'tag:hundred-episodes',$2,'achievement','test-achievement')`,
    [userId, timestamp],
  );
  assert.equal(await allowed('hundred-episodes'), true);
  await databaseClient.query(
    `INSERT INTO grants(order_id,user_id,starts_at,expires,reason)
     VALUES ('expired',$1,$2,$3,'expired')`,
    [userId, timestamp - 2000, timestamp - 1000],
  );
  assert.equal(await allowed('one-piece'), false);
  assert.equal(await allowed('hundred-episodes'), true);
  await databaseClient.query(
    `INSERT INTO user_cosmetics(user_id,cosmetic_id,unlocked_at,source,source_key)
     VALUES ($1,'pin:referral-scout',$2,'referral','test-referral')`,
    [userId, timestamp],
  );
  assert.equal(await allowed('referral-scout'), true);
  await databaseClient.close();
});

test('referral qualification changes once at 3600 server seconds', async () => {
  const databaseClient = await database();
  const referrer = crypto.randomUUID();
  const friend = crypto.randomUUID();
  const timestamp = Date.now();
  for (const [id, prefix] of [
    [referrer, 'owner'],
    [friend, 'friend'],
  ])
    await databaseClient.query(
      'INSERT INTO users(id,identity,nick,created_at) VALUES ($1,$2,$3,$4)',
      [id, `test:${id}`, `${prefix}_${id.slice(0, 8)}`, timestamp],
    );
  await databaseClient.query(
    'INSERT INTO referral_codes(user_id,code,created_at) VALUES ($1,$2,$3)',
    [referrer, 'TESTCODE', timestamp],
  );
  await databaseClient.query(
    `INSERT INTO referrals(id,referrer_id,referred_user_id,code,registered_at,created_at)
     VALUES ($1,$2,$3,'TESTCODE',$4,$4)`,
    [crypto.randomUUID(), referrer, friend, timestamp],
  );
  await databaseClient.query(
    `INSERT INTO history(user_id,anime_id,episode,duration,watched_seconds,completed,updated_at)
     VALUES ($1,21,1,7200,3599,1,$2)`,
    [friend, timestamp],
  );
  const qualify = () =>
    databaseClient.query(
      `UPDATE referrals SET status='qualified',qualified_at=$2 WHERE referred_user_id=$1 AND status='pending'
       AND (SELECT COALESCE(sum(watched_seconds),0) FROM history WHERE user_id=$1)>=3600 RETURNING id`,
      [friend, timestamp],
    );
  assert.equal((await qualify()).length, 0);
  await databaseClient.query(
    'UPDATE history SET watched_seconds=3600 WHERE user_id=$1 AND anime_id=21 AND episode=1',
    [friend],
  );
  assert.equal((await qualify()).length, 1);
  assert.equal((await qualify()).length, 0);
  await assert.rejects(() =>
    databaseClient.query(
      `INSERT INTO referrals(id,referrer_id,referred_user_id,code,registered_at,created_at)
       VALUES ($1,$2,$2,'TESTCODE',$3,$3)`,
      [crypto.randomUUID(), referrer, timestamp],
    ),
  );
  await databaseClient.close();
});

test('referral Plus grants sum and remain idempotent', async () => {
  const databaseClient = await database();
  const userId = crypto.randomUUID();
  const timestamp = Date.now();
  await databaseClient.query(
    'INSERT INTO users(id,identity,nick,created_at) VALUES ($1,$2,$3,$4)',
    [userId, `test:${userId}`, `plus_${userId.slice(0, 8)}`, timestamp],
  );
  const grant = (key, days) =>
    databaseClient.query(
      `INSERT INTO grants(order_id,user_id,starts_at,expires,reason)
       SELECT $1,$2,base,base+$3,'referral test' FROM (
         SELECT GREATEST($4,COALESCE(MAX(expires) FILTER(WHERE revoked_at IS NULL),0)) AS base
         FROM grants WHERE user_id=$2
       ) current ON CONFLICT(order_id) DO NOTHING RETURNING expires`,
      [`reward:${key}`, userId, days * 86400000, timestamp],
    );
  await grant('five', 7);
  await grant('five', 7);
  await grant('twenty-five', 30);
  const rows = await databaseClient.query(
    'SELECT MAX(expires) AS expires,count(*) AS count FROM grants WHERE user_id=$1',
    [userId],
  );
  assert.equal(Number(rows[0].count), 2);
  assert.equal(Number(rows[0].expires), timestamp + 37 * 86400000);
  await databaseClient.close();
});

test('five qualified friends claim the milestone exactly once', async () => {
  const databaseClient = await database();
  const owner = crypto.randomUUID();
  const timestamp = Date.now();
  await databaseClient.query(
    'INSERT INTO users(id,identity,nick,created_at) VALUES ($1,$2,$3,$4)',
    [owner, `test:${owner}`, `owner_${owner.slice(0, 8)}`, timestamp],
  );
  for (let index = 0; index < 5; index++) {
    const friend = crypto.randomUUID();
    await databaseClient.query(
      'INSERT INTO users(id,identity,nick,created_at) VALUES ($1,$2,$3,$4)',
      [friend, `test:${friend}`, `friend_${friend.slice(0, 8)}`, timestamp],
    );
    await databaseClient.query(
      `INSERT INTO referrals(id,referrer_id,referred_user_id,code,status,registered_at,qualified_at,created_at)
       VALUES ($1,$2,$3,'FIVE','qualified',$4,$4,$4)`,
      [crypto.randomUUID(), owner, friend, timestamp],
    );
  }
  const claim = async () => {
    await databaseClient.query(
      `INSERT INTO referral_reward_claims(user_id,milestone,created_at)
       SELECT $1,5,$2 WHERE (SELECT count(*) FROM referrals WHERE referrer_id=$1 AND status='qualified')>=5
       ON CONFLICT DO NOTHING`,
      [owner, timestamp],
    );
    await databaseClient.query(
      `INSERT INTO user_cosmetics(user_id,cosmetic_id,unlocked_at,source,source_key)
       VALUES ($1,'pin:referral-crew',$2,'referral','referral:5:referral-crew')
       ON CONFLICT DO NOTHING`,
      [owner, timestamp],
    );
  };
  await Promise.all([claim(), claim()]);
  const rows = await databaseClient.query(
    `SELECT
       (SELECT count(*) FROM referral_reward_claims WHERE user_id=$1 AND milestone=5) AS claims,
       (SELECT count(*) FROM user_cosmetics WHERE user_id=$1 AND cosmetic_id='pin:referral-crew') AS cosmetics`,
    [owner],
  );
  assert.equal(Number(rows[0].claims), 1);
  assert.equal(Number(rows[0].cosmetics), 1);
  await databaseClient.close();
});

test('watch-party free quota charges exactly ten unique episodes under concurrency', async () => {
  const databaseClient = await database();
  const userId = crypto.randomUUID();
  const timestamp = Date.now();
  const week = '2026-09-14';
  await databaseClient.query(
    'INSERT INTO users(id,identity,nick,created_at) VALUES ($1,$2,$3,$4)',
    [userId, `test:${userId}`, `party_${userId.slice(0, 8)}`, timestamp],
  );
  await databaseClient.query(
    'INSERT INTO watch_party_weekly_quotas(user_id,week_start,used,updated_at) VALUES ($1,$2,0,$3)',
    [userId, week, timestamp],
  );
  for (let episode = 1; episode <= 11; episode++)
    await databaseClient.query(
      `INSERT INTO watch_party_episode_usage(user_id,week_start,anime_id,episode,watched_seconds,updated_at)
       VALUES ($1,$2,16498,$3,299,$4)`,
      [userId, week, episode, timestamp],
    );
  const charge = (episode) =>
    databaseClient.query(
      `WITH current_usage AS (
         SELECT charged_at,watched_seconds FROM watch_party_episode_usage
         WHERE user_id=$1 AND week_start=$2 AND anime_id=16498 AND episode=$3 FOR UPDATE
       ), charged AS (
         UPDATE watch_party_weekly_quotas SET used=used+1,updated_at=$4
         WHERE user_id=$1 AND week_start=$2 AND used<10
           AND EXISTS (SELECT 1 FROM current_usage WHERE charged_at IS NULL AND watched_seconds+1>=300)
         RETURNING used
       )
       UPDATE watch_party_episode_usage SET
         watched_seconds=LEAST(300,watched_seconds+1),
         charged_at=CASE WHEN charged_at IS NULL AND watched_seconds+1>=300 AND EXISTS(SELECT 1 FROM charged) THEN $4 ELSE charged_at END,
         updated_at=$4
       WHERE user_id=$1 AND week_start=$2 AND anime_id=16498 AND episode=$3
       RETURNING charged_at`,
      [userId, week, episode, timestamp],
    );
  await Promise.all(
    Array.from({ length: 11 }, (_, index) => charge(index + 1)),
  );
  const result = (
    await databaseClient.query(
      `SELECT
       (SELECT used FROM watch_party_weekly_quotas WHERE user_id=$1 AND week_start=$2) AS used,
       count(*) FILTER (WHERE charged_at IS NOT NULL) AS charged
       FROM watch_party_episode_usage WHERE user_id=$1 AND week_start=$2`,
      [userId, week],
    )
  )[0];
  assert.equal(Number(result.used), 10);
  assert.equal(Number(result.charged), 10);
  await databaseClient.close();
});

test('watch-party membership, bans and active room cascade safely', async () => {
  const databaseClient = await database();
  const host = crypto.randomUUID();
  const guest = crypto.randomUUID();
  const party = crypto.randomUUID();
  const timestamp = Date.now();
  for (const id of [host, guest])
    await databaseClient.query(
      'INSERT INTO users(id,identity,nick,created_at) VALUES ($1,$2,$3,$4)',
      [id, `test:${id}`, `party_${id.slice(0, 8)}`, timestamp],
    );
  await databaseClient.query(
    `INSERT INTO watch_parties(id,code,host_user_id,anime_id,anime_title,episode,provider,voiceover,state_updated_at,created_at,expires_at)
     VALUES ($1,'PARTYTEST123',$2,16498,'Атака титанов',1,'aniliberty','aniliberty',$3,$3,$4)`,
    [party, host, timestamp, timestamp + 3600000],
  );
  await databaseClient.query(
    `INSERT INTO watch_party_members(party_id,user_id,role,joined_at,last_seen_at)
     VALUES ($1,$2,'host',$4,$4),($1,$3,'member',$4,$4)`,
    [party, host, guest, timestamp],
  );
  await databaseClient.query(
    'INSERT INTO watch_party_active_users(user_id,party_id,updated_at) VALUES ($1,$2,$3)',
    [guest, party, timestamp],
  );
  await databaseClient.query(
    'INSERT INTO watch_party_bans(party_id,user_id,created_by,created_at) VALUES ($1,$2,$3,$4)',
    [party, guest, host, timestamp],
  );
  await databaseClient.query('DELETE FROM watch_parties WHERE id=$1', [party]);
  const rows = await databaseClient.query(
    `SELECT
     (SELECT count(*) FROM watch_party_members WHERE party_id=$1) AS members,
     (SELECT count(*) FROM watch_party_bans WHERE party_id=$1) AS bans,
     (SELECT count(*) FROM watch_party_active_users WHERE party_id=$1) AS active`,
    [party],
  );
  assert.equal(Number(rows[0].members), 0);
  assert.equal(Number(rows[0].bans), 0);
  assert.equal(Number(rows[0].active), 0);
  await databaseClient.close();
});
