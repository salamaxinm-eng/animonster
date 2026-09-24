import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = await readFile(
  new URL('../lib/server/relation-graph.ts', import.meta.url),
  'utf8',
);
const graph = await import(
  'data:text/javascript;base64,' +
    Buffer.from(stripTypeScriptTypes(source)).toString('base64')
);
const displaySource = (
  await readFile(new URL('../lib/relation-display.ts', import.meta.url), 'utf8')
).replace(
  "import type { AnimeRelationsResult, RelationCard } from './server/anime-relations';",
  '',
);
const display = await import(
  'data:text/javascript;base64,' +
    Buffer.from(stripTypeScriptTypes(displaySource)).toString('base64')
);

test('prequel and sequel relations form one chronological chain', () => {
  const edges = graph.normalizeRelationEdges([
    { anime_id: 1, related_anime_id: 2, relation: 'Sequel' },
    { anime_id: 2, related_anime_id: 1, relation: 'Prequel' },
    { anime_id: 2, related_anime_id: 3, relation: 'Sequel' },
    { anime_id: 1, related_anime_id: 99, relation: 'Spin-off' },
  ]);
  assert.deepEqual(edges, [
    { from: 1, to: 2 },
    { from: 2, to: 3 },
  ]);
  const ids = graph.connectedRelationIds(2, edges);
  const result = graph.orderRelationIds(
    ids,
    edges,
    new Map([
      [1, 2013],
      [2, 2017],
      [3, 2018],
    ]),
  );
  assert.deepEqual(result.ordered, [1, 2, 3]);
  assert.equal(result.branching, false);
});

test('branching and cyclic relation graphs stay deterministic', () => {
  const branches = [
    { from: 1, to: 2 },
    { from: 1, to: 3 },
  ];
  const branchResult = graph.orderRelationIds(
    new Set([1, 2, 3]),
    branches,
    new Map([
      [1, 2013],
      [2, 2017],
      [3, 2018],
    ]),
  );
  assert.deepEqual(branchResult.ordered, [1, 2, 3]);
  assert.equal(branchResult.branching, true);
  assert.deepEqual(
    graph.relationPathThrough(
      2,
      new Set([1, 2, 3]),
      branches,
      new Map([
        [1, 2013],
        [2, 2017],
        [3, 2018],
      ]),
    ),
    [1, 2],
  );

  const cycleResult = graph.orderRelationIds(
    new Set([1, 2]),
    [
      { from: 1, to: 2 },
      { from: 2, to: 1 },
    ],
    new Map(),
  );
  assert.deepEqual(cycleResult.ordered, [1, 2]);
});

test('full franchise view removes duplicates and sorts unknown dates last', () => {
  const card = (id, aired_on, label, active = false) => ({
    item: { id, aired_on },
    label,
    active,
  });
  const result = display.chronologicalRelationCards({
    mainline: [
      card(2, '2020-01-01', 'Сезон 2'),
      card(1, '2013-01-01', 'Сезон 1'),
    ],
    branches: [card(3, '2015-01-01', 'Ветка')],
    related: [card(2, '2020-01-01', 'Дубликат', true), card(4, '', 'Прочее')],
  });
  assert.deepEqual(
    result.map((entry) => entry.item.id),
    [1, 3, 2, 4],
  );
  assert.equal(result.find((entry) => entry.item.id === 2).label, 'Сезон 2');
  assert.equal(result.find((entry) => entry.item.id === 2).active, true);
});
