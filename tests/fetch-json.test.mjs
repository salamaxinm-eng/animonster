import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import assert from 'node:assert/strict';
import test from 'node:test';

const source = await readFile(
  new URL('../lib/client/fetch-json.ts', import.meta.url),
  'utf8',
);
const { fetchJsonWithRetry } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(stripTypeScriptTypes(source)).toString('base64')
);

test('home data request retries a transient failure and returns data', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ items: [1] }), {
      status: calls === 1 ? 503 : 200,
    });
  };
  try {
    const result = await fetchJsonWithRetry(
      '/api/catalog',
      new AbortController().signal,
    );
    assert.equal(calls, 2);
    assert.deepEqual(result.data, { items: [1] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('home data request stops retrying after navigation abort', async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    controller.abort();
    throw new DOMException('Aborted', 'AbortError');
  };
  try {
    await assert.rejects(
      fetchJsonWithRetry('/api/catalog', controller.signal),
      { name: 'AbortError' },
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
