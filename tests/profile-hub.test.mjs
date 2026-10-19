import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';

const url = (source) =>
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const core = url(`
export class ApiError extends Error {constructor(message,status=400){super(message);this.status=status}}
export const db=()=>globalThis.hubTestDb;
export const now=()=>Date.now();
export const uid=()=>crypto.randomUUID();
export const premium=async()=>globalThis.hubTestAccess.premiumUntil;
export const json=value=>Response.json(value);
export const fail=error=>Response.json({error:error.message},{status:error.status||500});
export const sameOrigin=request=>{if(request.headers.get('origin')!==new URL(request.url).origin)throw new ApiError('Origin rejected',403)};
export const requireUser=async request=>{const id=request.headers.get('x-test-user');if(!id)throw new ApiError('Login required',401);return db().prepare('SELECT * FROM users WHERE id=?').bind(id).first()};
export const viewer=async request=>request.headers.get('x-test-user')?requireUser(request):null;
export const isModerator=()=>false;
export const runtime=()=>({});
export const publicUser=user=>({id:user.id,collection_public:user.collection_public});
export const body=request=>request.json();
export const inviteRequired=()=>false;
export const emailVerificationEnabled=()=>false;
`);
const load = async (path, replacements) => {
  let source = stripTypeScriptTypes(await readFile(path, 'utf8'));
  for (const [from, to] of replacements)
    source = source.replaceAll("'" + from + "'", JSON.stringify(to));
  return url(source);
};
const community = await load('lib/community.ts', []);
const cosmetics = await load('lib/server/cosmetics.ts', [['./core', core]]);
const images = await load('lib/server/images.ts', [['./core', core]]);
const access = url(
  'export const plusEntitlements=async()=>globalThis.hubTestAccess;',
);
const appearance = await load('lib/server/profile-appearance.ts', [
  ['../community', community],
  ['./core', core],
  ['./cosmetics', cosmetics],
  ['./plus', access],
  ['./images', images],
]);
const route = await import(
  await load('app/api/profile-hub/route.ts', [
    ['@/lib/server/core', core],
    ['@/lib/server/profile-appearance', appearance],
    ['@/lib/server/cosmetics', cosmetics],
    [
      '@/lib/server/achievements',
      url('export const evaluateUserAchievements=async()=>{};'),
    ],
  ])
);
const avatarRoute = await import(await load('app/api/avatar/route.ts', [['@/lib/server/core', core]]));
const uploadRoute = await import(await load('app/api/plus-assets/route.ts', [['@/lib/server/core', core], ['@/lib/server/plus', access], ['@/lib/server/images', images]]));
const publicRoute = await import(
  await load('app/api/community/route.ts', [
    ['@/lib/server/payment-gateway', url('export const paymentsReady=()=>false;')],
    ['@/lib/server/social-auth', url('export const socialReady=()=>false;')],
    ['@/lib/server/core', core],
    ['@/lib/community', community],
    ['@/lib/server/cosmetics', cosmetics],
    ['@/lib/server/images', images],
    [
      '@/lib/server/plus',
      url(
        'export const plusEntitlements=async()=>globalThis.hubTestAccess;export const reactions=[];',
      ),
    ],
    ['@/lib/server/library', url('export const getAnime=async()=>null;')],
    [
      '@/lib/server/recommendations/repository',
      url('export const markRecommendationsDirty=async()=>{};'),
    ],
  ])
);

test('profile hub isolates owners, paginates and filters real data, and saves appearance atomically', async () => {
  const engine = new PGlite({ extensions: { pg_trgm } });
  const database = (connection) => ({
    prepare(source) {
      let values = [];
      let index = 0;
      const sql = source.replace(/\?/g, () => '$' + ++index);
      return {
        bind(...args) {
          values = args;
          return this;
        },
        async first() {
          return (await connection.query(sql, values)).rows[0] || null;
        },
        async all() {
          return { results: (await connection.query(sql, values)).rows };
        },
        async run() {
          return connection.query(sql, values);
        },
      };
    },
    transaction(callback) {
      return connection.transaction((tx) => callback(database(tx)));
    },
  });
  globalThis.hubTestDb = database(engine);
  globalThis.hubTestAccess = {
    active: true,
    premiumUntil: Date.now() + 86400000,
    canChangeAvatar: true,
  };
  const get = async (kind, extra = '', owner = 'owner') => {
    const response = await route.GET(
      new Request('http://localhost/api/profile-hub?kind=' + kind + extra, {
        headers: owner ? { 'x-test-user': owner } : {},
      }),
    );
    return { status: response.status, data: await response.json() };
  };
  const post = async (input, files = {}, origin = 'http://localhost') => {
    const form = new FormData();
    form.set('appearance', JSON.stringify(input));
    for (const [key, file] of Object.entries(files)) form.set(key, file);
    return route.POST(
      new Request('http://localhost/api/profile-hub', {
        method: 'POST',
        headers: { 'x-test-user': 'owner', origin },
        body: form,
      }),
    );
  };
  try {
    for (const file of (await readdir('migrations/postgres'))
      .filter((name) => name.endsWith('.sql'))
      .sort())
      await engine.exec(await readFile('migrations/postgres/' + file, 'utf8'));
    await engine.exec(`INSERT INTO users(id,identity,nick,bio,avatar,theme,created_at) VALUES ('owner','test:owner','Owner','Keep me','moon','neon',1),('other','test:other','Other','Private','moon','neon',1);
      INSERT INTO collection(user_id,anime_id,title,image,status) SELECT 'owner',n,'Title '||n,'/hero.png','watching' FROM generate_series(1,45)n;
      INSERT INTO collection(user_id,anime_id,title,image,status) VALUES ('other',999,'PRIVATE TITLE','/hero.png','completed');
      INSERT INTO history(user_id,anime_id,episode,position,duration,completed,watched_seconds,updated_at) SELECT 'owner',1,n,300,1440,CASE WHEN n<=3 THEN 1 ELSE 0 END,300,${Date.now()}-n FROM generate_series(1,45)n;
      INSERT INTO history(user_id,anime_id,episode,position,duration,completed,watched_seconds,updated_at) VALUES ('other',999,1,999,1440,1,999,${Date.now()});
      INSERT INTO collection_lists(id,user_id,name,created_at,slot) VALUES ('own-list','owner','Mine',1,1),('other-list','other','Private',1,1);
      INSERT INTO collection_list_items(list_id,anime_id) VALUES ('own-list',1),('other-list',999);
      INSERT INTO orders(id,user_id,status,created_at,plan,amount) VALUES ('own-payment','owner','succeeded',1,'monthly',150),('vpn-payment','owner','succeeded',1,'vpn',150),('other-payment','other','succeeded',1,'monthly',150);
      INSERT INTO plus_assets(id,user_id,kind,mime_type,data,updated_at) VALUES ('other-bg','other','profile_background','image/png','\\x00',1);`);
    assert.equal((await get('history', '', null)).status, 401);
    const history = await get('history', '&id=other');
    assert.equal(history.status, 200);
    assert.equal(history.data.items.length, 40);
    assert.equal(history.data.hasMore, true);
    assert.ok(history.data.items.every((item) => item.anime_id === 1));
    assert.equal((await get('history', '&page=1')).data.items.length, 5);
    assert.equal((await get('history', '&q=missing')).data.items.length, 0);
    const list = await get('list');
    assert.equal(list.data.items.length, 40);
    assert.equal(list.data.hasMore, true);
    assert.equal(list.data.items[0].total_episodes, null);
    assert.equal(Number(list.data.counts[0].count), 45);
    assert.equal(
      (await get('list', '&status=list:own-list')).data.items.length,
      1,
    );
    assert.equal(
      (await get('list', '&status=list:other-list')).data.items.length,
      0,
    );
    assert.equal((await get('list', '&status=completed')).data.items.length, 0);
    const overview = (await get('overview')).data;
    assert.equal(Number(overview.summary.anime_count), 45);
    assert.equal(Number(overview.summary.completed_episodes), 3);
    assert.equal(overview.continue.length, 1);
    assert.deepEqual(
      (await get('payments')).data.items.map((item) => item.id),
      ['own-payment'],
    );
    const activity = await get('activity', '&type=watch');
    assert.equal(activity.status, 200);
    assert.equal(activity.data.items.length, 40);
    assert.ok(
      activity.data.items.every(
        (item) => item.kind === 'watch' && item.anime_id === 1,
      ),
    );
    assert.equal(
      (await get('activity', '&type=achievement')).data.items.length,
      0,
    );
    await engine.exec("UPDATE users SET collection_public=0 WHERE id='other'");
    const hidden = await publicRoute.GET(
      new Request(
        'http://localhost/api/community?action=profile_list&id=other',
        { headers: { 'x-test-user': 'owner' } },
      ),
    );
    assert.equal(hidden.status, 403);
    assert.ok(!(await hidden.text()).includes('PRIVATE TITLE'));
    const publicList = await publicRoute.GET(
      new Request(
        'http://localhost/api/community?action=profile_list&id=owner',
      ),
    );
    assert.equal(publicList.status, 200);
    assert.equal((await publicList.json()).items.length, 40);
    const publicCompact = await publicRoute.GET(
      new Request(
        'http://localhost/api/community?action=profile&view=hub&id=other',
        { headers: { 'x-test-user': 'owner' } },
      ),
    );
    assert.equal(publicCompact.status, 200);
    assert.deepEqual((await publicCompact.json()).entries, []);
    const initial = {
      avatar: 'moon',
      theme: 'v2-neon',
      frame: 'none',
      pin: null,
      tag: null,
      background: null,
    };
    const snapshot = async () =>
      (
        await engine.query(
          "SELECT avatar,theme,profile_frame,pin,tag,profile_background,nick,bio FROM users WHERE id='owner'",
        )
      ).rows[0];
    const before = await snapshot();
    assert.equal((await post(initial, {}, 'https://foreign.test')).status, 403);
    assert.equal(
      (await post({ ...initial, background: 'asset:other-bg:1' })).status,
      403,
    );
    assert.deepEqual(await snapshot(), before);
    assert.equal(
      (await post({ ...initial, frame: 'referral-tide', avatar: 'valley' }))
        .status,
      403,
    );
    assert.deepEqual(await snapshot(), before);
    const bytes = Buffer.alloc(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47]);
    bytes.writeUInt32BE(128, 16);
    bytes.writeUInt32BE(128, 20);
    assert.equal(
      (
        await post(
          { ...initial, frame: 'referral-tide' },
          { avatar: new File([bytes], 'test.png', { type: 'image/png' }) },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await engine.query(
          "SELECT count(*)::int AS count FROM user_avatars WHERE user_id='owner'",
        )
      ).rows[0].count,
      0,
    );
    globalThis.hubTestAccess = {
      active: false,
      premiumUntil: 0,
      canChangeAvatar: false,
    };
    assert.equal((await post({ ...initial, avatar: 'valley' })).status, 403);
    assert.deepEqual(await snapshot(), before);
    globalThis.hubTestAccess = {
      active: true,
      premiumUntil: Date.now() + 86400000,
      canChangeAvatar: true,
    };
    assert.equal(
      (await post({ ...initial, avatar: 'valley', theme: 'v2-sakura' })).status,
      200,
    );
    const after = await snapshot();
    assert.equal(after.avatar, 'valley');
    assert.equal(after.theme, 'v2-sakura');
    assert.equal(after.nick, before.nick);
    assert.equal(after.bio, before.bio);
    // Uploads are denied even with Plus; existing images survive unrelated saves.
    assert.equal((await post(initial, {avatar:new File([bytes], 'test.png', {type:'image/png'})})).status,403);
    assert.equal((await post(initial, {background:new File([bytes], 'test.png', {type:'image/png'})})).status,403);
    const direct = async (handler, path, kind) => {
      const form = new FormData(); form.set('kind',kind); form.set('image',new File([bytes],'test.png',{type:'image/png'}));
      return handler.POST(new Request('http://localhost'+path,{method:'POST',headers:{origin:'http://localhost','x-test-user':'owner'},body:form}));
    };
    assert.equal((await direct(avatarRoute,'/api/avatar','avatar')).status,403);
    assert.equal((await direct(uploadRoute,'/api/plus-assets','profile_background')).status,403);
    await engine.exec("INSERT INTO user_avatars(user_id,mime_type,data,updated_at) VALUES ('owner','image/png','\\x0102',123); INSERT INTO plus_assets(id,user_id,kind,mime_type,data,updated_at) VALUES ('own-bg','owner','profile_background','image/png','\\x0304',123); UPDATE users SET avatar='custom:owner:123',profile_background='asset:own-bg:123' WHERE id='owner'");
    const old = {...initial,avatar:'custom:owner:123',background:'asset:own-bg:123'};
    assert.equal((await post({...old,theme:'v2-sakura'})).status,200);
    assert.equal((await snapshot()).avatar,old.avatar);
    assert.equal((await snapshot()).profile_background,old.background);
    globalThis.hubTestAccess={active:false,premiumUntil:0,canChangeAvatar:false};
    assert.equal((await post(old)).status,200);
    globalThis.hubTestAccess={active:true,premiumUntil:Date.now()+86400000,canChangeAvatar:true};
    assert.equal((await post({...old,avatar:'valley',background:null})).status,200);
    assert.equal((await post({...old,avatar:'valley'})).status,403,'previous custom backgrounds cannot be re-equipped');
    assert.equal((await post({...old,background:null})).status,400,'previous custom avatars cannot be re-equipped');
    assert.equal((await engine.query("SELECT count(*)::int count FROM user_avatars WHERE user_id='owner'")).rows[0].count,1);
    assert.equal((await engine.query("SELECT count(*)::int count FROM plus_assets WHERE id='own-bg'")).rows[0].count,1);
  } finally {
    await engine.close();
    delete globalThis.hubTestDb;
    delete globalThis.hubTestAccess;
  }
});
