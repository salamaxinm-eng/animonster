import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

const moduleUrl = (source) =>
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const animeUrl = moduleUrl(
  stripTypeScriptTypes(await readFile(new URL('../lib/anime.ts', import.meta.url), 'utf8')),
);
const kodikCoreUrl = moduleUrl(
  'export const runtime=()=>({});export const now=()=>0;export const db=()=>({});',
);
const kodikSource = stripTypeScriptTypes(
  await readFile(new URL('../lib/server/kodik.ts', import.meta.url), 'utf8'),
)
  .replace("from '@/lib/anime'", `from '${animeUrl}'`)
  .replace("from '@/lib/server/core'", `from '${kodikCoreUrl}'`);
const kodik = await import(moduleUrl(kodikSource));

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

globalThis.kodikPlayerRouteHelpers = kodik;
globalThis.kodikPlayerRouteCore = {
  ApiError,
  db: () => globalThis.kodikPlayerRouteDb,
  fail: (error) =>
    Response.json({ error: error.message }, { status: error.status || 500 }),
  now: () => 1_000,
  premium: async () => globalThis.kodikPlayerPremiumUntil,
  viewer: async () => globalThis.kodikPlayerViewer,
};
const routeSource = stripTypeScriptTypes(
  await readFile(new URL('../app/api/kodik/player/route.ts', import.meta.url), 'utf8'),
)
  .replace(
    /import \{ ApiError, db, fail, now, premium, viewer \} from '@\/lib\/server\/core';/,
    'const { ApiError, db, fail, now, premium, viewer } = globalThis.kodikPlayerRouteCore;',
  )
  .replace(
    /import \{[\s\S]*?\} from '@\/lib\/server\/kodik';/,
    'const { kodikEpisodeOrdinals, kodikHasEpisodeMap, kodikSeasonPlayer, safeKodikPlayerUrl } = globalThis.kodikPlayerRouteHelpers;',
  );
const route = await import(moduleUrl(routeSource));

const exact = 'https://kodik.info/seria/first';
const season = 'https://kodik.info/season/one';
const payload = {
  seasons: {
    1: {
      link: season,
      episodes: { 1: exact, 2: 'https://kodik.info/seria/second' },
    },
  },
};

function setup({ lockedEpisode = 0, plus = false } = {}) {
  globalThis.kodikPlayerViewer = plus ? { id: 'plus-user' } : null;
  globalThis.kodikPlayerPremiumUntil = plus ? 2_000 : 0;
  const availability = [1, 2].map((episode) => ({
    episode,
    free_at: episode === lockedEpisode ? 2_000 : 0,
  }));
  globalThis.kodikPlayerRouteDb = {
    prepare(query) {
      return {
        bind(...params) {
          return {
            async first() {
              if (query.includes('SELECT free_at FROM anime_episode_availability'))
                return availability.find((row) => row.episode === params[1]);
              if (query.includes('SELECT player_url FROM kodik_episode_links'))
                return { player_url: exact };
              throw new Error('Unexpected first query');
            },
            async all() {
              if (query.includes('SELECT player_url,episodes_count,payload'))
                return {
                  results: [{ player_url: 'https://kodik.info/serial/one', episodes_count: 2, payload: JSON.stringify(payload) }],
                };
              if (query.includes('SELECT episode,free_at FROM anime_episode_availability'))
                return { results: availability };
              throw new Error('Unexpected all query');
            },
          };
        },
      };
    },
  };
}

const request = () =>
  new Request('https://animonster.su/api/kodik/player?anime_id=21&translation=91&episode=1');

test('Kodik keeps native season controls when every episode is free', async () => {
  setup();
  const response = await route.GET(request());
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), `${season}?episode=1`);
});

test('Kodik uses the exact episode player if another season episode is Plus locked', async () => {
  setup({ lockedEpisode: 2 });
  const response = await route.GET(request());
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), `${exact}?episode=1`);
});

test('Plus users can open the native season player', async () => {
  setup({ lockedEpisode: 2, plus: true });
  const response = await route.GET(request());
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), `${season}?episode=1`);
});

test('a locked requested episode stays unavailable to non-Plus users', async () => {
  setup({ lockedEpisode: 1 });
  const response = await route.GET(request());
  assert.equal(response.status, 403);
});
