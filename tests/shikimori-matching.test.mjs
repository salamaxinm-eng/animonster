import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = await readFile(
  new URL('../lib/server/shikimori-matching.ts', import.meta.url),
  'utf8',
);
const matching = await import(
  'data:text/javascript;base64,' +
    Buffer.from(stripTypeScriptTypes(source)).toString('base64')
);

const anime = {
  name: 'Cowboy Bebop',
  russian: 'Ковбой Бибоп',
  mal_id: 1,
};

test('title matching accepts a unique exact Russian or alternate-title match', () => {
  const candidates = [
    { id: 1, malId: 1, name: 'Cowboy Bebop', russian: 'Ковбой Бибоп' },
    {
      id: 2,
      malId: 5,
      name: 'Cowboy Bebop: Tengoku no Tobira',
      russian: 'Достучаться до небес',
    },
  ];
  assert.equal(matching.exactShikimoriMatch(candidates, anime), candidates[0]);
  assert.equal(
    matching.exactShikimoriMatch(
      [
        {
          id: 3,
          malId: 9,
          name: 'Other',
          russian: 'Другое',
          synonyms: ['Ковбой Бибоп'],
        },
      ],
      { ...anime, mal_id: undefined },
    )?.id,
    3,
  );
});

test('title matching rejects ambiguous candidates and MAL mismatches', () => {
  const candidates = [
    { id: 1, malId: 1, name: 'Cowboy Bebop', russian: 'Ковбой Бибоп' },
    { id: 2, malId: 1, name: 'Ковбой Бибоп', russian: 'Другой перевод' },
  ];
  assert.equal(matching.exactShikimoriMatch(candidates, anime), undefined);
  assert.equal(
    matching.exactShikimoriMatch(
      [{ id: 4, malId: 44, name: 'Cowboy Bebop', russian: 'Ковбой Бибоп' }],
      anime,
    ),
    undefined,
  );
});

test('explicit Shikimori ID wins only when it agrees with known MAL ID', () => {
  const candidates = [
    { id: 1, malId: 1, name: 'Cowboy Bebop', russian: 'Ковбой Бибоп' },
  ];
  assert.equal(
    matching.exactShikimoriMatch(candidates, { ...anime, shikimori_id: 1 }),
    candidates[0],
  );
  assert.equal(
    matching.exactShikimoriMatch(candidates, {
      ...anime,
      mal_id: 2,
      shikimori_id: 1,
    }),
    undefined,
  );
});

test('Kodik catalog matching requires one exact title, year and compatible type', () => {
  const candidates = [
    {
      id: 1,
      name: 'Cowboy Bebop',
      russian: 'Ковбой Бибоп',
      kind: 'tv',
      aired_on: '1998-04-03',
    },
    {
      id: 5,
      name: 'Cowboy Bebop: Tengoku no Tobira',
      russian: 'Ковбой Бибоп: Достучаться до небес',
      synonyms: ['Cowboy Bebop Movie'],
      kind: 'movie',
      aired_on: '2001-09-01',
    },
  ];
  assert.equal(
    matching.exactKodikCatalogMatch(candidates, {
      title: 'Cowboy Bebop',
      year: 1998,
      type: 'anime-serial',
    })?.id,
    1,
  );
  assert.equal(
    matching.exactKodikCatalogMatch(candidates, {
      title: 'Cowboy Bebop Movie',
      year: 2001,
      type: 'anime',
    })?.id,
    5,
  );
  assert.equal(
    matching.exactKodikCatalogMatch(candidates, {
      title: 'Cowboy Bebop',
      year: 2001,
      type: 'anime-serial',
    }),
    undefined,
  );
});

test('Kodik catalog matching rejects ambiguous results', () => {
  const duplicate = {
    name: 'Example',
    kind: 'tv',
    aired_on: '2024-01-01',
  };
  assert.equal(
    matching.exactKodikCatalogMatch(
      [
        { ...duplicate, id: 10 },
        { ...duplicate, id: 11 },
      ],
      { title: 'Example', year: 2024, type: 'anime-serial' },
    ),
    undefined,
  );
});

test('only unique Russian Shikimori theme labels are returned', () => {
  assert.deepEqual(
    matching.russianThemes({
      genres: [
        { kind: 'genre', russian: 'Экшен' },
        { kind: 'theme', russian: 'Космос' },
        { kind: 'theme', russian: 'Космос' },
        { kind: 'theme', russian: null },
        { kind: 'demographic', russian: 'Сёнен' },
      ],
    }),
    ['Космос'],
  );
});
