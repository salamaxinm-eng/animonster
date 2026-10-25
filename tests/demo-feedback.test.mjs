import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
const url = (code) =>
  'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const code = stripTypeScriptTypes(
  await readFile('lib/demo-feedback.ts', 'utf8'),
);
const coverage = await import(url(code));
const episodes = [1, 2, 3, 4].map((number) => ({ number, duration: 100 }));

void test('survey requires 70 percent of three distinct episodes and never adds rewatched coverage twice', () => {
  let watched = coverage.mergeCoverage(
    { 1: [[0, 60]] },
    { 1: [[20, 70]], 2: [[0, 70]], 3: [[0, 69.99]] },
    episodes,
  );
  assert.deepEqual(watched[1], [[0, 70]]);
  assert.equal(coverage.feedbackEligible(watched, episodes), false);
  watched = coverage.mergeCoverage(watched, { 3: [[69, 70]] }, episodes);
  assert.equal(coverage.feedbackEligible(watched, episodes), true);
  assert.deepEqual(coverage.mergeCoverage(watched, watched, episodes), watched);
  assert.equal(
    coverage.feedbackEligible({ 1: [[0, 100]], 2: [[0, 100]] }, episodes),
    false,
  );
  assert.throws(() => coverage.normalizeRanges([[0, Infinity]], 100));
  assert.throws(() => coverage.normalizeRanges([[-1, 40]], 100));
  assert.throws(() => coverage.normalizeRanges([[0, 200]], 100));
});

void test('playback sampling excludes seeks, pauses and stalls while accepting supported playback speeds', () => {
  const previous = { position: 10, wall: 1000, playing: true, rate: 1 };
  assert.deepEqual(
    coverage.playedInterval(previous, {
      ...previous,
      position: 11,
      wall: 2000,
    }),
    [10, 11],
  );
  assert.equal(
    coverage.playedInterval(previous, {
      ...previous,
      position: 80,
      wall: 2000,
    }),
    undefined,
  );
  assert.equal(
    coverage.playedInterval(previous, {
      ...previous,
      position: 11,
      wall: 2000,
      playing: false,
    }),
    undefined,
  );
  assert.equal(
    coverage.playedInterval(previous, {
      ...previous,
      position: 10,
      wall: 2000,
    }),
    undefined,
  );
  assert.equal(
    coverage.playedInterval(previous, {
      ...previous,
      position: 30,
      wall: 21000,
    }),
    undefined,
  );
  assert.equal(
    coverage.playedInterval(null, { ...previous, position: 80 }),
    undefined,
  );
  assert.deepEqual(
    coverage.playedInterval(
      { ...previous, rate: 2 },
      { ...previous, rate: 2, position: 12, wall: 2000 },
    ),
    [10, 12],
  );
});

void test('continuous season playback allocates watched seconds across real episode boundaries', () => {
  const chapters = episodes.map((episode, index) => ({
    episode: episode.number,
    start: index * 100,
    stop: (index + 1) * 100,
  }));
  const watched = coverage.addPlaybackRange({}, [98, 102], episodes, chapters);
  assert.deepEqual(watched, { 1: [[98, 100]], 2: [[0, 2]] });
  assert.deepEqual(
    coverage.addPlaybackRange(watched, [0, 2], episodes, undefined, 2),
    watched,
  );
});

function database(connection) {
  return {
    prepare(source) {
      let values = [],
        index = 0;
      const sql = source.replace(/\?/g, () => '$' + ++index);
      const execute = () => {
        // postgres.js infers JSONB parameters and serializes their JS values.
        // A serialized JSON string must enter SQL as text before conversion.
        const parameters = [...values];
        for (const match of sql.matchAll(/\$(\d+)::jsonb/g))
          parameters[Number(match[1]) - 1] = JSON.stringify(
            parameters[Number(match[1]) - 1],
          );
        return connection.query(sql, parameters);
      };
      return {
        bind(...params) {
          values = params;
          return this;
        },
        async first() {
          return (await execute()).rows[0] ?? null;
        },
        async all() {
          return { results: (await execute()).rows };
        },
        async run() {
          return execute();
        },
      };
    },
    transaction(callback) {
      return connection.transaction((tx) => callback(database(tx)));
    },
  };
}

void test('database persists private guest/account surveys, checks eligibility, snoozes and accepts one response only', async () => {
  const engine = new PGlite();
  try {
    await engine.exec(
      "CREATE TABLE users(id text PRIMARY KEY,nick text); INSERT INTO users VALUES ('alice','Alice'),('bob','Bob')",
    );
    await engine.exec(
      await readFile(
        'migrations/postgres/0061_player_demo_feedback.sql',
        'utf8',
      ),
    );
    globalThis.demoFeedbackDb = database(engine);
    const core = url(
      `export const db=()=>globalThis.demoFeedbackDb;export const now=()=>Date.now();export class ApiError extends Error{constructor(message,status=400){super(message);this.status=status;}}`,
    );
    const source = stripTypeScriptTypes(
      await readFile('lib/server/demo-feedback.ts', 'utf8'),
    )
      .replace("'./core'", JSON.stringify(core))
      .replace(
        "'./player-demo'",
        JSON.stringify(
          url(
            `export const demoCatalog=async()=>({episodes:${JSON.stringify(episodes)}});`,
          ),
        ),
      )
      .replace("'../demo-feedback'", JSON.stringify(url(code)));
    const api = await import(url(source));
    await assert.rejects(
      api.changeFeedback('user:alice', 'alice', {
        action: 'submit',
        score: 9,
        comment: 'Too early',
      }),
      (error) => error.status === 403,
    );
    const almost = { 1: [[0, 70]], 2: [[0, 70]], 3: [[0, 69]] };
    assert.equal(
      (
        await api.changeFeedback('user:alice', 'alice', {
          action: 'watch',
          watched: almost,
        })
      ).eligible,
      false,
    );
    const ready = await api.changeFeedback('user:alice', 'alice', {
      action: 'watch',
      watched: { 3: [[69, 70]] },
    });
    assert.equal(ready.eligible, true);
    assert.deepEqual((await api.feedbackStatus('user:bob')).watched, {});
    const snoozed = await api.changeFeedback('user:alice', 'alice', {
      action: 'dismiss',
    });
    assert.ok(snoozed.dismissedUntil > Date.now() + 6 * 86400000);
    for (const score of [0, 11, 2.5, '8'])
      await assert.rejects(
        api.changeFeedback('user:alice', 'alice', {
          action: 'submit',
          score,
          comment: '',
        }),
        (error) => error.status === 400,
      );
    await assert.rejects(
      api.changeFeedback('user:alice', 'alice', {
        action: 'submit',
        score: 9,
        comment: 'x'.repeat(2001),
      }),
    );
    const sent = await api.changeFeedback('user:alice', 'alice', {
      action: 'submit',
      score: 9,
      comment: '  Works well <script>alert(1)</script>  ',
    });
    assert.equal(sent.submitted, true);
    await api.changeFeedback('user:alice', 'alice', {
      action: 'submit',
      score: 1,
      comment: 'duplicate',
    });
    const guest = await api.changeFeedback('guest:test', null, {
      action: 'watch',
      watched: { 1: [[0, 70]], 2: [[0, 70]], 3: [[0, 70]] },
    });
    assert.equal(guest.eligible, true);
    await api.changeFeedback('guest:test', null, {
      action: 'submit',
      score: 7,
    });
    const results = await api.feedbackResults();
    assert.equal(results.count, 2);
    assert.equal(results.average, 8);
    assert.equal(results.items.find((item) => item.nick === 'Alice').score, 9);
    assert.equal(
      results.items.find((item) => item.nick === 'Alice').comment,
      'Works well <script>alert(1)</script>',
    );
    assert.equal((await api.feedbackStatus('user:bob')).submitted, false);
    await engine.exec("DELETE FROM users WHERE id='alice'");
    assert.equal((await api.feedbackResults()).count, 1);
  } finally {
    delete globalThis.demoFeedbackDb;
    await engine.close();
  }
});
