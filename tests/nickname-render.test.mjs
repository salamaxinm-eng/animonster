import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes, createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const url = (s) =>
  'data:text/javascript;base64,' + Buffer.from(s).toString('base64');
const shared = url(
  stripTypeScriptTypes(await readFile('lib/nickname-styles.ts', 'utf8')),
);
const colors = (await import(shared)).nicknameColors;
const source = ts
  .transpileModule(await readFile('components/user-nickname.tsx', 'utf8'), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
    },
  })
  .outputText.replace(
    '"react/jsx-runtime"',
    JSON.stringify(
      pathToFileURL(createRequire(import.meta.url).resolve('react/jsx-runtime'))
        .href,
    ),
  )
  .replace("'@/lib/nickname-styles'", JSON.stringify(shared));
const { UserNickname } = await import(url(source));
void test('shared renderer preserves exclusive gold, escapes nicknames, applies all colors/effects and disabled motion', () => {
  const render = (user) =>
    renderToStaticMarkup(React.createElement(UserNickname, { user }));
  assert.equal(render({ nick: 'Ordinary' }), '<span>Ordinary</span>');
  assert.match(
    render({ nick: 'Gold', legend_origin_at: 1 }),
    /nickname-legend-gold/,
  );
  assert.doesNotMatch(
    render({
      nick: 'Unowned',
      nickname_style: { color: 'legend', effect: 'shimmer', motion: true },
    }),
    /nickname-legend-gold/,
  );
  assert.doesNotMatch(
    render({
      nick: 'Gold',
      legend_origin_at: 1,
      nickname_style: { color: 'default', effect: 'solid', motion: false },
    }),
    /nickname-legend-gold/,
  );
  assert.match(
    render({
      nick: 'Gold',
      legend_origin_at: 1,
      nickname_style: { color: 'legend', effect: 'shimmer', motion: false },
    }),
    /nickname-legend-gold nickname-still/,
  );
  for (const [color, , hex] of colors)
    for (const effect of [
      'solid',
      'gradient',
      'shimmer',
      'neon',
      'metal',
      'stars',
    ]) {
      const html = render({
        nick: '<script>',
        nickname_style: { color, effect, motion: false },
      });
      assert.match(html, new RegExp('nickname-' + effect + ' nickname-still'));
      assert.ok(html.includes('--nick-color:' + hex));
      const palette = colors.find((item) => item[0] === color);
      assert.ok(html.includes('--nick-accent:' + palette[4]));
      assert.ok(html.includes('&lt;script&gt;'));
    }
});
