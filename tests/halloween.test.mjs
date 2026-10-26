import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes, createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
const url = (s) =>
  'data:text/javascript;base64,' + Buffer.from(s).toString('base64');
const eventUrl = url(
  stripTypeScriptTypes(await readFile('lib/halloween.ts', 'utf8')),
);
const season = await import(eventUrl);
void test('season ends automatically after November 3 in UTC+05; cached bootstrap expires without changing chosen themes', () => {
  assert.equal(season.halloweenActive(season.HALLOWEEN_START - 1), false);
  assert.equal(season.halloweenActive(season.HALLOWEEN_START), true);
  assert.equal(
    season.halloweenActive(Date.parse('2026-11-03T23:59:59.999+05:00')),
    true,
  );
  assert.equal(
    season.halloweenActive(Date.parse('2026-11-04T00:00:00+05:00')),
    false,
  );
  for (const theme of ['eclipse', 'v2-bleach', 'v2-neon']) {
    const dataset = { siteTheme: theme };
    const context = {
      document: { documentElement: { dataset } },
      Date: { now: () => season.HALLOWEEN_START },
      localStorage: { getItem: () => '1' },
    };
    runInNewContext(season.halloweenBootstrap, context);
    assert.equal(dataset.halloween, '2026');
    assert.equal(dataset.siteTheme, theme);
    assert.equal(dataset.hwCalm, '1');
    context.Date.now = () => season.HALLOWEEN_END;
    runInNewContext(season.halloweenBootstrap, context);
    assert.equal(dataset.halloween, undefined);
    assert.equal(dataset.siteTheme, theme);
  }
  assert.doesNotThrow(() =>
    runInNewContext(season.halloweenBootstrap, {
      document: { documentElement: { dataset: {} } },
      Date: { now: () => season.HALLOWEEN_START },
    }),
  );
});
void test('surprise transition navigates once, ignores repeated clicks and cleans up all pending work', () => {
  let now = 0,
    id = 0;
  const jobs = new Map(),
    states = [];
  let navigations = 0;
  const controller = season.createHalloweenSurprise(
    (fn, ms) => {
      const key = ++id;
      jobs.set(key, { fn, at: now + ms });
      return key;
    },
    (key) => jobs.delete(key),
    (state) => states.push(state),
  );
  function tick(ms) {
    const end = now + ms;
    while (true) {
      const next = [...jobs]
        .filter(([, j]) => j.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      jobs.delete(next[0]);
      now = next[1].at;
      next[1].fn();
    }
    now = end;
  }
  assert.equal(
    controller.run(() => navigations++, true),
    true,
  );
  assert.deepEqual(states, [true]);
  assert.equal(
    controller.run(() => (navigations += 100), true),
    false,
  );
  tick(459);
  assert.equal(navigations, 0);
  tick(1);
  assert.equal(navigations, 1);
  tick(590);
  assert.deepEqual(states, [true, false]);
  controller.run(() => navigations++, false);
  assert.equal(navigations, 2);
  assert.equal(
    jobs.size,
    0,
    'quiet/reduced-motion path has no delay or overlay',
  );
  controller.run(() => navigations++, true);
  controller.dispose();
  tick(2000);
  assert.equal(navigations, 2);
  assert.equal(jobs.size, 0);
});
void test('pumpkin expressions rotate without losing the fifth-click easter egg', () => {
  assert.deepEqual(
    Array.from({ length: 7 }, (_, i) => season.pumpkinFace(i)),
    [0, 1, 2, 3, 4, 0, 1],
  );
  assert.equal(season.pumpkinFace(-1), 0);
});
async function component(active) {
  const require = createRequire(import.meta.url),
    file = (p) => pathToFileURL(require.resolve(p)).href;
  let source = ts.transpileModule(
    await readFile('components/halloween.tsx', 'utf8'),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText;
  for (const [name, target] of Object.entries({
    react: file('react'),
    'react/jsx-runtime': file('react/jsx-runtime'),
    'lucide-react': file('lucide-react'),
    'next/navigation': url('export const usePathname=()=>"/";'),
    '@/lib/halloween': eventUrl,
  }))
    source = source
      .replaceAll("'" + name + "'", JSON.stringify(target))
      .replaceAll('"' + name + '"', JSON.stringify(target));
  if (active) source = source.replace('active: false,', 'active: true,');
  return import(url(source));
}
void test('desktop and mobile brands keep navigation separate from the accessible ghost control', async () => {
  const ordinary = await component(false),
    holiday = await component(true);
  for (const mobile of [false, true]) {
    const normal = renderToStaticMarkup(
      React.createElement(ordinary.SeasonalBrand, { mobile }),
    );
    assert.match(normal, /href="\/"/);
    assert.doesNotMatch(normal, /<button/);
    const html = renderToStaticMarkup(
      React.createElement(holiday.SeasonalBrand, { mobile }),
    );
    assert.match(html, /hw-witch-hat/);
    assert.match(html, /aria-label="Спрятать призрака/);
    assert.match(html, /<\/button><a/);
    assert.doesNotMatch(html, /<a[^>]*><button/);
    assert.match(html, /<\/a><span class="hw-brand-apple"/);
    assert.match(html, /aria-label="Взять яблоко Рюка"/);
    assert.equal((html.match(/<button/g) || []).length, 2);
  }
});
