import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

const moduleUrl = (text) =>
  'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
const shared = moduleUrl(
  stripTypeScriptTypes(await readFile('lib/photo-search.ts', 'utf8')),
);
const { detectPhotoFrame, softenPhotoSubtitles } = await import(
  moduleUrl(
    stripTypeScriptTypes(
      await readFile('lib/photo-search-preprocess.ts', 'utf8'),
    ),
  )
);
const { runPhotoSearch } = await import(
  moduleUrl(
    stripTypeScriptTypes(
      await readFile('lib/photo-search-runner.ts', 'utf8'),
    ).replace("'./photo-search'", JSON.stringify(shared)),
  )
);

function pixels(width, height, color = [0, 0, 0]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([...color, 255], i);
  return { width, height, data };
}
function rect(p, x, y, w, h, color) {
  for (let row = y; row < y + h; row++)
    for (let col = x; col < x + w; col++)
      p.data.set([...color, 255], (row * p.width + col) * 4);
}
function scene(p, x, y, width, height) {
  for (let row = y; row < y + height; row++)
    for (let col = x; col < x + width; col++)
      rect(p, col, row, 1, 1, [
        ((col * 9) % 200) + 20,
        ((row * 7) % 190) + 20,
        ((col + row) % 180) + 20,
      ]);
}

test('finds off-center anime band in a TikTok screenshot despite caption/UI pixels in black margins', () => {
  const p = pixels(216, 384);
  scene(p, 0, 82, 216, 122);
  for (let x = 40; x < 170; x += 10) rect(p, x, 270, 4, 8, [255, 255, 255]);
  rect(p, 195, 310, 9, 9, [255, 255, 255]);
  const crop = detectPhotoFrame(p);
  assert.ok(Math.abs(crop.y * p.height - 82) <= 2);
  assert.ok(Math.abs(crop.height * p.height - 122) <= 3);
  assert.equal(crop.width, 1);
});

test('detects white/colored borders and pillarboxing without clipping full original or dark flat shots', () => {
  for (const color of [
    [255, 255, 255],
    [18, 12, 30],
  ]) {
    const p = pixels(320, 240, color);
    scene(p, 40, 25, 240, 180);
    const crop = detectPhotoFrame(p);
    assert.ok(Math.abs(crop.x * p.width - 40) <= 2);
    assert.ok(Math.abs(crop.width * p.width - 240) <= 3);
    assert.ok(Math.abs(crop.y * p.height - 25) <= 2);
  }
  const original = pixels(320, 180);
  scene(original, 0, 0, 320, 180);
  assert.deepEqual(detectPhotoFrame(original), {
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  });
  assert.deepEqual(detectPhotoFrame(pixels(320, 180, [7, 8, 10])), {
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  });
});

test('softens an aligned white outlined caption without modifying the original or an isolated bright object', () => {
  const p = pixels(320, 180, [60, 100, 140]);
  for (let x = 70; x < 240; x += 16) {
    rect(p, x - 1, 143, 7, 15, [0, 0, 0]);
    rect(p, x, 144, 5, 13, [255, 255, 255]);
  }
  const original = new Uint8ClampedArray(p.data);
  const result = softenPhotoSubtitles(p);
  assert.equal(result.changed, true);
  assert.deepEqual(p.data, original);
  assert.notDeepEqual(result.pixels.data, original);
  const clean = pixels(320, 180, [60, 100, 140]);
  rect(clean, 30, 30, 15, 15, [0, 0, 0]);
  rect(clean, 31, 31, 13, 13, [255, 255, 255]);
  assert.equal(softenPhotoSubtitles(clean).changed, false);
});

const variants = Array.from({ length: 6 }, (_, i) => ({
  label: 'variant ' + i,
  image: async () => new Blob(['frame ' + i], { type: 'image/jpeg' }),
}));
const hit = (id, similarity) => ({ anilist: id, similarity, episode: 1 });
const response = (...result) => Response.json({ result });

test('searches sequentially, merges best per anime, stops early and labels the actual winning variant', async () => {
  let calls = 0,
    inFlight = 0;
  const result = await runPhotoSearch(
    variants,
    new AbortController().signal,
    () => {},
    async (_, init) => {
      assert.equal(inFlight++, 0);
      assert.ok(init.body instanceof FormData);
      assert.equal(init.credentials, 'omit');
      await Promise.resolve();
      inFlight--;
      return ++calls === 1
        ? response(hit(1, 0.91), hit(2, 0.9))
        : response(hit(1, 0.96), hit(3, 0.925));
    },
  );
  assert.equal(calls, 2);
  assert.equal(result.attempts, 2);
  assert.deepEqual(
    result.matches.map((x) => x.anilistId),
    [1, 3, 2],
  );
  assert.equal(result.matches[0].variant, 'variant 1');
  assert.equal(result.matches[0].similarity, 0.96);
});

test('caps weak searches at four and never inflates confidence by repeated matches', async () => {
  let calls = 0;
  const result = await runPhotoSearch(
    variants,
    new AbortController().signal,
    () => {},
    async () => {
      calls++;
      return response(hit(1, 0.91));
    },
  );
  assert.equal(calls, 4);
  assert.equal(result.matches[0].similarity, 0.91);
});

test('does not present unrelated low-similarity neighbors as recognition', async () => {
  const result = await runPhotoSearch(
    variants,
    new AbortController().signal,
    () => {},
    async () => response(hit(1, 0.82), hit(2, 0.6)),
  );
  assert.deepEqual(result.matches, []);
});

test('quota stops additional uploads immediately and preserves earlier results with a warning', async () => {
  let calls = 0;
  const transport = async () =>
    ++calls === 1
      ? response(hit(1, 0.91))
      : Response.json({ error: 'quota depleted' }, { status: 402 });
  const result = await runPhotoSearch(
    variants,
    new AbortController().signal,
    () => {},
    transport,
  );
  assert.equal(calls, 2);
  assert.equal(result.matches.length, 1);
  assert.match(result.warning, /исчерпан/);
  await assert.rejects(
    () =>
      runPhotoSearch(
        variants,
        new AbortController().signal,
        () => {},
        async () => Response.json({}, { status: 429 }),
      ),
    /ограничил/,
  );
});

test('cancellation prevents stale results and further variant uploads', async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(
    () =>
      runPhotoSearch(
        variants,
        controller.signal,
        () => {},
        async () => {
          calls++;
          controller.abort();
          return response(hit(1, 0.99));
        },
      ),
    { name: 'AbortError' },
  );
  assert.equal(calls, 1);
});

await test('identical processed images are not uploaded twice', async () => {
  let calls = 0;
  const repeated = Array.from({ length: 4 }, () => ({
    label: 'same image',
    image: async () => new Blob(['same frame']),
  }));
  const result = await runPhotoSearch(
    repeated,
    new AbortController().signal,
    () => {},
    async () => {
      calls++;
      return response(hit(1, 0.91));
    },
  );
  assert.equal(calls, 1);
  assert.equal(result.attempts, 1);
});
