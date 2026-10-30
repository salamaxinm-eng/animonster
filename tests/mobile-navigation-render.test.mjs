import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
const url = (s) =>
  'data:text/javascript;base64,' + Buffer.from(s).toString('base64');
const react = JSON.stringify(import.meta.resolve('react'));
const stub = url(
  `import {createElement as h}from ${react};export const HalloweenNavIcon=({children})=>h('span',null,children),SeasonalBrand=()=>h('b',null,'AniMonster'),PhotoSearchButton=()=>null,BuySubscription=()=>null,MobileProfileMenu=({active})=>h('button',{'aria-label':'Профиль',className:active?'active':''},'Профиль');export const useCommunity=()=>({user:globalThis.navUser,login:()=>{}}),usePassAccess=()=>globalThis.navPass,useMobileNavigationVisibility=()=>globalThis.navHidden;`,
);
let source = ts.transpileModule(
  await readFile('components/mobile-navigation.tsx', 'utf8'),
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  },
).outputText;
const replacements = {
  react: import.meta.resolve('react'),
  'react/jsx-runtime': import.meta.resolve('react/jsx-runtime'),
  'lucide-react': import.meta.resolve('lucide-react'),
  'next/link': url(
    `import {createElement as h}from ${react};export default function Link({href,children,prefetch,...props}){return h('a',{href,...props},children)}`,
  ),
  'next/navigation': url(
    `export const usePathname=()=>globalThis.navPath,useSearchParams=()=>new URLSearchParams(globalThis.navQuery||'');`,
  ),
};
for (const name of [
  '@/components/halloween-nav-icon',
  '@/components/halloween',
  '@/components/photo-search-button',
  '@/components/community/mobile-profile-menu',
  '@/components/community/buy-subscription',
  '@/components/community/context',
  '@/components/pass-cosmetics',
  '@/hooks/use-mobile-navigation-visibility',
])
  replacements[name] = stub;
for (const [name, target] of Object.entries(replacements))
  source = source
    .replaceAll(`from '${name}'`, `from ${JSON.stringify(target)}`)
    .replaceAll(`from "${name}"`, `from ${JSON.stringify(target)}`);
const { MobileNavigation } = await import(url(source));
function render(
  path = '/',
  query = '',
  { pass = true, user = null, hidden = false } = {},
) {
  Object.assign(globalThis, {
    navPath: path,
    navQuery: query,
    navPass: pass,
    navUser: user,
    navHidden: hidden,
  });
  return renderToStaticMarkup(createElement(MobileNavigation));
}
function nav(html) {
  const match = html.match(
    /<nav\b[^>]*class="mobile-bottom-nav[^>]*>[\s\S]*?<\/nav>/,
  );
  assert.ok(match);
  return match[0];
}

test('one existing navigation contains unchanged routes and conditionally includes Pass', () => {
  const full = nav(render());
  assert.equal((full.match(/<nav\b/g) || []).length, 1);
  for (const href of ['/', '/catalog', '/battlepass', '/profile?section=list'])
    assert.ok(full.includes('href="' + href + '"'));
  assert.match(full, /aria-label="Профиль"/);
  assert.match(full, /--nav-items:5/);
  const limited = nav(render('/', '', { pass: false }));
  assert.doesNotMatch(limited, /\/battlepass/);
  assert.match(limited, /--nav-items:4/);
});
test('active pill follows Catalog, anime, themes, profile list and the signed-in profile menu', () => {
  for (const path of [
    '/catalog',
    '/anime/21',
    '/themes/Исекай',
    '/genres/Комедия',
  ])
    assert.match(nav(render(path)), /--nav-active-index:1/);
  const list = nav(render('/profile', 'section=list'));
  assert.match(list, /--nav-active-index:3/);
  assert.match(
    list,
    /href="\/profile\?section=list" class="active" aria-current="page"/,
  );
  const profile = nav(render('/profile', '', { user: { id: 'fixture' } }));
  assert.match(profile, /--nav-active-index:4/);
  assert.match(profile, /<button aria-label="Профиль" class="active">/);
  const noActive = nav(render('/downloads'));
  assert.match(noActive, /class="mobile-nav-active-pill" data-visible="false"/);
});
test('hidden navigation is inert and absent from accessibility; excluded routes keep their existing policy', () => {
  const hidden = nav(render('/catalog', '', { hidden: true }));
  assert.match(hidden, /data-hidden="true"/);
  assert.match(hidden, /aria-hidden="true"/);
  assert.match(hidden, /\binert=""/);
  const visible = nav(render());
  assert.doesNotMatch(visible, /\binert=""/);
  for (const path of ['/search', '/admin', '/legal/privacy', '/reset-password'])
    assert.doesNotMatch(render(path), /mobile-bottom-nav/);
});
