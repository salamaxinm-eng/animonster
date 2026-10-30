import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const url = (source) =>
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const anime = url(stripTypeScriptTypes(await readFile('lib/anime.ts', 'utf8')));
const carousel = url(`import {createElement as h} from ${JSON.stringify(import.meta.resolve('react'))};
export function Carousel({children}){return h('div',null,children)}
export const CarouselContent=Carousel,CarouselItem=Carousel;`);
const context = url('export const useCommunity=()=>({user:null}),api=()=>{};');
let source = ts.transpileModule(
  await readFile('components/popular-hero.tsx', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } },
).outputText;
for (const [name, target] of Object.entries({
  react: import.meta.resolve('react'),
  'react/jsx-runtime': import.meta.resolve('react/jsx-runtime'),
  'lucide-react': import.meta.resolve('lucide-react'),
  '@/lib/anime': anime,
  '@/components/ui/carousel': carousel,
  '@/components/community/context': context,
}))
  source = source.replaceAll(`from '${name}'`, `from ${JSON.stringify(target)}`)
    .replaceAll(`from "${name}"`, `from ${JSON.stringify(target)}`);
const { PopularHero } = await import(url(source));

test('hero renders shared responsive posters without a separate blurry foreground download', () => {
  const initial = [20, 34572].map((id) => ({
    id, russian: 'Аниме', name: 'Anime', score: '8', aired_on: '2002-01-01',
    episodes: 12, image: { original: `https://shikimori.io/uploads/poster/${id}.jpg` },
  }));
  const markup = renderToStaticMarkup(createElement(PopularHero, { initial, onOpen() {} }));
  const images = [...markup.matchAll(/<img\b[^>]*class="hero-(?:backdrop|feature-poster)"[^>]*>/g)].map(([tag]) => {
    const attributes = Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]));
    return attributes;
  });
  assert.equal(images.length, 4);
  for (let i = 0; i < images.length; i += 2) {
    const [background, foreground] = images.slice(i, i + 2);
    for (const key of ['src', 'srcSet', 'sizes', 'fetchPriority', 'loading'])
      assert.equal(background[key], foreground[key], key);
    assert.match(foreground.src, /w=960/);
    assert.match(foreground.srcSet, /w=480[^ ]* 480w, .*w=960[^ ]* 960w/);
    assert.equal(foreground.sizes, '100vw');
    assert.equal(foreground.loading, i === 0 ? 'eager' : 'lazy');
    assert.equal(foreground.fetchPriority, i === 0 ? 'high' : 'auto');
  }
  assert.equal((markup.match(/<h1\b/g) || []).length, 1);
});
