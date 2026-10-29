// Local, synthetic database for raw-HTML checks. Never point this script at a
// production database. It creates a new PGlite directory and refuses reuse.
import { mkdir, readdir, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';

const directory = path.resolve(process.argv[2] || '.data/seo-http-fixture');
try {
  await access(directory);
  throw new Error('Fixture directory already exists');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await mkdir(path.dirname(directory), { recursive: true });
const db = new PGlite(directory, { extensions: { pg_trgm } });
try {
  for (const file of (await readdir('migrations/postgres'))
    .filter((x) => x.endsWith('.sql'))
    .sort())
    await db.exec(await readFile('migrations/postgres/' + file, 'utf8'));
  const timestamp = Date.now();
  for (let id = 1; id <= 60; id++) {
    const genres = ['Комедия', ...(id > 30 && id <= 36 ? ['Школа'] : [])];
    const themes = [
      ...(id <= 30 ? [id % 2 ? 'Исекай' : 'Исэкай'] : []),
      ...(id > 36 && id <= 42 ? ['Магия'] : []),
    ];
    const anime = {
      id,
      russian: 'SEO-фикстура ' + id,
      name: 'SEO Fixture ' + id,
      kind: 'tv',
      status: 'ongoing',
      score: 9 - id / 100,
      aired_on: '2024-01-01',
      episodes: 100,
      genres,
      description:
        'Синтетическая запись для локальной проверки HTML. Не данные действующего каталога.',
      image: { original: '/icon.png' },
      providers: ['kodik'],
      primary_provider: 'kodik',
      identity_checked_at: timestamp,
    };
    await db.query(
      `INSERT INTO anime_cache(id,data,episodes,updated_at,primary_provider,search_text,kind_index,status_index,year_index,score_index,genres_index)
      VALUES($1,$2,'[]',$3,'kodik',$4,'tv','ongoing',2024,$5,$6)`,
      [
        id,
        JSON.stringify(anime),
        timestamp,
        anime.russian,
        anime.score,
        JSON.stringify(genres),
      ],
    );
    await db.query(
      `INSERT INTO anime_search_metadata(anime_id,themes,status,checked_at,normalized_aliases)
      VALUES($1,$2,'ok',$3,$4)`,
      [id, JSON.stringify(themes), timestamp, [anime.russian.toLowerCase()]],
    );
    await db.query(
      "INSERT INTO anime_relation_state(anime_id,status,checked_at) VALUES($1,'not_found',$2)",
      [id, timestamp],
    );
  }
  await db.query(
    'INSERT INTO catalog_page_cache(cache_key,data,updated_at) VALUES($1,$2,$3)',
    [
      'taxonomy:shikimori:v1',
      JSON.stringify([
        { id: '1', russian: 'Комедия', kind: 'genre' },
        ...['Исекай', 'Магия', 'Школа', 'Пустая тема'].map((russian) => ({
          id: russian,
          russian,
          kind: 'theme',
        })),
      ]),
      timestamp,
    ],
  );
  const source = {
    type: 'anime-serial',
    shikimori_id: 21,
    title: 'SEO Fixture 21',
    link: 'https://kodik.info/serial/seo-fixture/not-a-real-player/',
    translation: { id: 777, title: 'SEO Studio', type: 'voice' },
    episodes_count: 100,
    seasons: {
      1: {
        episodes: {
          1: 'https://kodik.info/video/seo-fixture-1/not-a-real-player/',
          3: 'https://kodik.info/video/seo-fixture-3/not-a-real-player/',
        },
      },
    },
  };
  await db.query(
    "INSERT INTO anime_sources(provider,source_id,anime_id,payload,last_seen_at) VALUES('kodik','seo-fixture',21,$1,$2)",
    [JSON.stringify(source), timestamp],
  );
  await db.query(
    'INSERT INTO anime_episode_availability VALUES(21,1,$1,$1),(21,3,$1,$2)',
    [timestamp - 1000, timestamp + 86400000],
  );
  console.log(
    JSON.stringify({
      fixture: directory,
      titles: 60,
      users: 0,
      confirmedEpisodes: [1, 3],
    }),
  );
} finally {
  await db.close();
}
