import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = (
  await readFile(
    new URL('../lib/server/recommendations/engine.ts', import.meta.url),
    'utf8',
  )
)
  .replace(/^import type[^;]+;\r?\n/m, '')
  .replace(
    /import \{[\s\S]*?\} from '\.\/config';/,
    `const RECOMMENDATION_RESULT_LIMIT = 20;
     const RECOMMENDATION_WEIGHTS = {
       personalSimilarity: .32, collaborativeScore: .25, behaviourScore: .15,
       qualityScore: .10, freshnessScore: .08, trendingScore: .06,
       explorationScore: .04
     };`,
  );
const recommendations = await import(
  'data:text/javascript;base64,' +
    Buffer.from(stripTypeScriptTypes(source)).toString('base64')
);

const anime = (id, genres, extra = {}) => ({
  id,
  name: `Title ${id}`,
  russian: `Тайтл ${id}`,
  image: { original: '/test.jpg' },
  score: '8.0',
  kind: 'tv',
  episodes: 12,
  aired_on: '2024',
  genres,
  ...extra,
});

test('completed and favorite anime are excluded from candidates', () => {
  assert.equal(
    recommendations.userCandidatePenalty({ fullyWatched: true }),
    null,
  );
  assert.equal(recommendations.userCandidatePenalty({ favorite: true }), null);
});

test('favorite genre raises score and dropped titles receive a penalty', () => {
  const at = Date.UTC(2026, 0, 1);
  const profile = recommendations.buildTasteProfile(
    [
      {
        anime: anime(1, ['Экшен']),
        weight: 10,
        completion: 1,
        updatedAt: at,
      },
    ],
    at,
  );
  const [action, romance] = recommendations.scoreCandidates(
    'user',
    [{ anime: anime(2, ['Экшен']) }, { anime: anime(3, ['Романтика']) }],
    profile,
    at,
  );
  assert.ok(action.score > romance.score);
  assert.ok(
    recommendations.userCandidatePenalty({ dropped: true }) >
      recommendations.userCandidatePenalty({}),
  );
});

test('freshness does not outweigh a strong personal match', () => {
  const at = Date.UTC(2026, 0, 1);
  const profile = recommendations.buildTasteProfile(
    [
      {
        anime: anime(1, ['Экшен']),
        weight: 10,
        completion: 1,
        updatedAt: at,
      },
    ],
    at,
  );
  const ranked = recommendations.scoreCandidates(
    'user',
    [
      { anime: anime(2, ['Экшен'], { aired_on: '2015' }) },
      { anime: anime(3, ['Романтика'], { aired_on: '2026' }) },
    ],
    profile,
    at,
  );
  assert.ok(ranked[0].score > ranked[1].score);
});

test('reranking avoids filling the feed with one franchise', () => {
  const sameFranchise = Array.from({ length: 8 }, (_, index) => ({
    anime: anime(index + 1, ['Экшен'], {
      name: `Naruto Movie ${index + 1}`,
      russian: `Наруто ${index + 1}`,
    }),
    score: 1 - index / 100,
    reason: 'test',
    source: 'personal',
  }));
  const alternatives = Array.from({ length: 20 }, (_, index) => ({
    anime: anime(index + 100, [index % 2 ? 'Драма' : 'Комедия'], {
      name: `Distinct${String.fromCharCode(97 + index)} Story`,
    }),
    score: 0.8 - index / 100,
    reason: 'test',
    source: 'quality',
  }));
  const result = recommendations.rerankRecommendations([
    ...sameFranchise,
    ...alternatives,
  ]);
  assert.equal(result.length, 20);
  assert.equal(
    result.filter((item) => item.anime.name.startsWith('Naruto')).length,
    1,
  );
});

test('cold start returns stable quality recommendations', () => {
  const at = Date.UTC(2026, 0, 1);
  const candidates = Array.from({ length: 25 }, (_, index) => ({
    anime: anime(index + 1, [index % 2 ? 'Экшен' : 'Драма']),
    trending: index / 25,
  }));
  const profile = recommendations.buildTasteProfile([], at);
  const first = recommendations.rerankRecommendations(
    recommendations.scoreCandidates('guest', candidates, profile, at),
  );
  const second = recommendations.rerankRecommendations(
    recommendations.scoreCandidates('guest', candidates, profile, at),
  );
  assert.equal(first.length, 20);
  assert.deepEqual(
    first.map((item) => item.anime.id),
    second.map((item) => item.anime.id),
  );
});
