import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const url = (source) =>
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
async function load(file, replacements = {}) {
  let source = ts.transpileModule(await readFile(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  for (const [name, value] of Object.entries({
    'react/jsx-runtime': import.meta.resolve('react/jsx-runtime'),
    react: import.meta.resolve('react'),
    ...replacements,
  }))
    source = source
      .replaceAll(`from '${name}'`, `from ${JSON.stringify(value)}`)
      .replaceAll(`from "${name}"`, `from ${JSON.stringify(value)}`);
  const moduleUrl = url(source);
  return { moduleUrl, ...(await import(moduleUrl)) };
}
const engine = new PGlite({ extensions: { pg_trgm } });
for (const file of (await readdir('migrations/postgres'))
  .filter((x) => x.endsWith('.sql'))
  .sort())
  await engine.exec(await readFile('migrations/postgres/' + file, 'utf8'));
after(() => engine.close());
globalThis.folderTestDb = {
  prepare(source) {
    let i = 0,
      values = [];
    const sql = source.replace(/\?/g, () => '$' + ++i);
    return {
      bind(...args) {
        values = args;
        return this;
      },
      async first() {
        return (await engine.query(sql, values)).rows[0] || null;
      },
      async all() {
        return { results: (await engine.query(sql, values)).rows };
      },
      async run() {
        return engine.query(sql, values);
      },
    };
  },
};
const core = url(`
export const db=()=>globalThis.folderTestDb,now=()=>Date.now();
export class ApiError extends Error{constructor(message,status=400){super(message);this.status=status}}
export const json=value=>Response.json(value,{headers:{'Cache-Control':'private, no-store'}});
export const fail=e=>Response.json({error:e.message},{status:e.status||500});
export const viewer=async r=>r.headers.get('x-test-user')?db().prepare('SELECT * FROM users WHERE id=?').bind(r.headers.get('x-test-user')).first():null;
export const requireUser=async r=>{const u=await viewer(r);if(!u)throw new ApiError('Login required',401);return u};
`);
const base = await load('lib/server/achievements.ts', {
  './core': core,
  './cosmetics': url(
    "export const grantCosmetic=()=>{throw Error('Read-only overview must not grant rewards')}",
  ),
});
const grouped = await load('lib/achievement-folders.ts');
const piece = url(
  `export const onePieceOverview=async id=>({count:1,xp:10,rank:'Новичок',unlocked:id==='alice'?1:0,achievements:Array.from({length:44},(_,i)=>({id:'PIECE_'+i,name:'Пират '+i,description:'Путь One Piece',progress:id==='alice'&&i===0?1:0,threshold:1,completed:id==='alice'&&i===0,unlocked_at:null,rewards:[]}))});`,
);
const overview = await load('lib/server/achievement-overview.ts', {
  './achievements': base.moduleUrl,
  './one-piece': piece,
  '../achievement-folders': grouped.moduleUrl,
});
const evaluation = url(
  `export const evaluateUserAchievements=async id=>{globalThis.folderEvaluations.push(id)};`,
);
globalThis.folderEvaluations = [];
const catalog = await load('app/api/achievements/route.ts', {
  '@/lib/server/core': core,
  '@/lib/server/achievements': evaluation,
  '@/lib/server/achievement-overview': overview.moduleUrl,
});
const stats = await load('app/api/stats/route.ts', {
  '@/lib/server/core': core,
  '@/lib/server/achievement-overview': overview.moduleUrl,
});
await engine.exec(`INSERT INTO users(id,identity,nick,collection_public,created_at) VALUES('alice','test:alice','Alice',1,1),('bob','test:bob','Bob',0,1);
INSERT INTO history(user_id,anime_id,episode,duration,completed,watched_seconds,updated_at) SELECT 'alice',20,n,1440,1,720,1 FROM generate_series(1,50)n;
INSERT INTO user_achievements(user_id,achievement_id,unlocked_at) VALUES('alice','achievement:naruto',1),('bob','achievement:bleach',1);`);
for (const [id, russian] of [
  [20, 'Наруто'],
  [269, 'Блич'],
  [21, 'One Piece'],
])
  await engine.query(
    "INSERT INTO anime_cache(id,data,episodes,updated_at) VALUES($1,$2,'[]',1)",
    [id, JSON.stringify({ id, russian, name: russian })],
  );
const request = (path, who) =>
  new Request('https://animonster.su' + path, {
    headers: who ? { 'x-test-user': who } : {},
  });

const icon = url(
  `import {createElement as h} from ${JSON.stringify(import.meta.resolve('react'))};export const Trophy=()=>h('span'),Award=Trophy,Check=Trophy,Folder=Trophy,LockKeyhole=Trophy;`,
);
const progress = url(
  `import {createElement as h} from ${JSON.stringify(import.meta.resolve('react'))};export const Progress=({value})=>h('div',{'data-progress':value});`,
);
const viewer = await load('components/community/viewer-achievements.tsx', {
  'lucide-react': icon,
  '@/components/ui/progress': progress,
});
const reactView = url(
  `import {createElement as h} from ${JSON.stringify(import.meta.resolve('react'))};export default function Link({href,children,...p}){return h('a',{href,...p},children)}`,
);
const hub = url(
  `import {createElement as h} from ${JSON.stringify(import.meta.resolve('react'))};export const Art=()=>null,ResourceState=()=>null,FilterTabs=()=>null,Progress=()=>null;export const Empty=({children})=>h('p',null,children);export const dateLabel=()=>'';export const useResource=()=>({data:globalThis.folderUiData,loading:false,error:'',retry:()=>{}});`,
);
const section = await load(
  'components/community/profile-hub/achievements-section.tsx',
  {
    'next/link': reactView,
    'next/navigation': url(
      "export const useSearchParams=()=>new URLSearchParams(globalThis.folderUiParams||'')",
    ),
    'lucide-react': icon,
    './shared': hub,
  },
);

test('each anime has a distinct folder, including legacy and new One Piece achievements', async () => {
  const data = await overview.achievementOverview('alice');
  assert.equal(
    data.achievements.length,
    Number(
      (
        await engine.query(
          "SELECT count(*) n FROM achievements WHERE active=1 AND metric IN ('completed_episodes','anime_completed_episodes')",
        )
      ).rows[0].n,
    ) + 44,
  );
  assert.equal(data.folders.find((x) => x.id === 'anime-20').name, 'Наруто');
  assert.equal(data.folders.find((x) => x.id === 'anime-269').name, 'Блич');
  assert.equal(data.folders.find((x) => x.id === 'anime-21').total, 46);
  assert.equal(
    data.achievements.find((x) => x.id === 'achievement:naruto').folder,
    'anime-20',
  );
  assert.ok(
    !data.folders.some((x) => x.id === 'anime' || x.name === 'Другие аниме'),
  );
  assert.equal(
    data.folders.filter((x) => x.id !== 'all').reduce((n, x) => n + x.total, 0),
    data.summary.total,
  );
  assert.equal(
    data.folders.find((x) => x.id === 'all').completed,
    data.summary.completed,
  );
});

test('catalog and profile read the same real counts instead of 20 synthetic milestones', async () => {
  const catResponse = await catalog.GET(
    request('/api/achievements?id=bob', 'alice'),
  );
  const data = await catResponse.json();
  const readResponse = await stats.GET(
    request('/api/stats?summary=1', 'alice'),
  );
  const profile = await readResponse.json();
  assert.equal(catResponse.status, 200);
  assert.equal(readResponse.status, 200);
  assert.deepEqual(profile.achievement_summary, data.summary);
  assert.deepEqual(
    profile.achievements.map((x) => x.id),
    data.achievements.map((x) => x.id),
  );
  assert.equal(
    profile.achievements.filter((x) => x.unlocked).length,
    data.summary.completed,
  );
  assert.notEqual(profile.achievement_summary.total, 20);
  assert.deepEqual(globalThis.folderEvaluations, ['alice']);
  assert.match(readResponse.headers.get('cache-control'), /no-store/);
  assert.equal((await catalog.GET(request('/api/achievements'))).status, 401);
});

test('hidden profile does not reveal anime folders or individual progress; reads do not grant rewards', async () => {
  const before = (
    await engine.query('SELECT count(*) n FROM user_achievements')
  ).rows[0].n;
  const publicView = await (
    await stats.GET(request('/api/stats?id=bob&summary=1', 'alice'))
  ).json();
  assert.equal(publicView.visible, false);
  assert.deepEqual(publicView.achievements, []);
  assert.deepEqual(publicView.achievement_folders, []);
  assert.equal(publicView.achievement_summary.completed, 1);
  const ownerView = await (
    await stats.GET(request('/api/stats?id=bob&summary=1', 'bob'))
  ).json();
  assert.equal(ownerView.visible, true);
  assert.ok(
    ownerView.achievements.some(
      (x) => x.id === 'achievement:bleach' && x.unlocked,
    ),
  );
  assert.equal(
    (await engine.query('SELECT count(*) n FROM user_achievements')).rows[0].n,
    before,
  );
});

test('new anime definitions automatically create named folders without a hardcoded list', async () => {
  const before = (await overview.achievementOverview('alice')).summary.total;
  await engine.exec(
    `INSERT INTO achievements(id,slug,name,description,category,metric,threshold,anime_id) VALUES('test:new','test-new','Новое достижение','Посмотри серию «Новое аниме»','anime','anime_completed_episodes',1,123456);`,
  );
  const data = await overview.achievementOverview('alice');
  assert.equal(data.summary.total, before + 1);
  assert.equal(
    data.folders.find((x) => x.id === 'anime-123456').name,
    'Новое аниме',
  );
});

test('old anime URL shows per-title folders, selection isolates an anime, and viewer count is dynamic', async () => {
  globalThis.folderUiData = await overview.achievementOverview('alice');
  globalThis.folderUiParams = 'folder=anime';
  const cards = renderToStaticMarkup(
    createElement(section.AchievementsSection),
  );
  assert.match(cards, /folder=anime-20/);
  assert.match(cards, /folder=anime-269/);
  assert.match(cards, /Наруто/);
  assert.match(cards, /Блич/);
  assert.doesNotMatch(cards, /Другие аниме/);
  globalThis.folderUiParams = 'folder=anime-269';
  const bleach = renderToStaticMarkup(
    createElement(section.AchievementsSection),
  );
  assert.match(bleach, /<h2>Блич<\/h2>/);
  assert.match(bleach, /Пробуждение синигами/);
  assert.doesNotMatch(bleach, /Путь шиноби/);
  globalThis.folderUiParams = 'folder=one-piece';
  assert.match(
    renderToStaticMarkup(createElement(section.AchievementsSection)),
    /<h2>Ван-Пис<\/h2>/,
  );
  const data = await (
    await stats.GET(request('/api/stats?summary=1', 'alice'))
  ).json();
  const html = renderToStaticMarkup(
    createElement(viewer.ViewerAchievements, {
      achievements: data.achievements,
      folders: data.achievement_folders,
      summary: data.achievement_summary,
    }),
  );
  assert.match(html, new RegExp(`из ${data.achievement_summary.total}`));
  assert.match(html, /Наруто/);
  assert.match(html, /Блич/);
  assert.doesNotMatch(html, /из 20<|Другие аниме/);
});
