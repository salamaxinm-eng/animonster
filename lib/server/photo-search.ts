import type { Anime } from '@/lib/anime';
import {
  boundedText,
  positiveId,
  record,
  type CatalogSceneMatch,
} from '@/lib/photo-search';
import { normalizeMatchTitle } from './shikimori-matching';
import { db, now } from './core';

export type AniListIdentity = {
  id: number;
  idMal: number | null;
  titles: string[];
  primaryTitles: string[];
  year: number | null;
  format: string;
};
const TTL = 7 * 24 * 60 * 60 * 1000;
const pending = new Map<number, Promise<AniListIdentity | null>>();
let upstreamBlockedUntil = 0;

function identity(value: unknown, id: number): AniListIdentity | null {
  const item = record(value);
  if (positiveId(item.id) !== id || item.type !== 'ANIME') return null;
  const title = record(item.title);
  const primaryTitles = Object.values(title)
    .map((value) => boundedText(value))
    .filter(Boolean);
  const titles = [
    ...Object.values(title),
    ...(Array.isArray(item.synonyms) ? item.synonyms.slice(0, 40) : []),
  ]
    .map((value) => boundedText(value))
    .filter(Boolean);
  if (!titles.length) return null;
  const year = record(item.startDate).year;
  return {
    id,
    idMal: positiveId(item.idMal),
    titles: [...new Set(titles)],
    primaryTitles,
    format: boundedText(item.format, 20),
    year:
      typeof year === 'number' && year >= 1900 && year <= 2200 ? year : null,
  };
}

async function loadIdentity(id: number, signal: AbortSignal) {
  const key = 'photo-search:anilist:v1:' + id;
  const cached = await db()
    .prepare('SELECT data,updated_at FROM catalog_page_cache WHERE cache_key=?')
    .bind(key)
    .first<{ data: string; updated_at: number }>();
  let previous: AniListIdentity | null = null;
  if (cached) {
    try {
      previous = identity(JSON.parse(cached.data), id);
    } catch {}
    if (previous && Number(cached.updated_at) > now() - TTL) return previous;
  }
  if (upstreamBlockedUntil > now()) {
    if (previous) return previous;
    throw new Error('AniList temporarily unavailable');
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 8000);
  try {
    if (signal.aborted) controller.abort();
    const response = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        query:
          'query ($id: Int!) { Media(id: $id, type: ANIME) { id idMal type title { romaji english native } synonyms format startDate { year } } }',
        variables: { id },
      }),
      signal: controller.signal,
      cache: 'no-store',
      redirect: 'error',
    });
    if (!response.ok) {
      if (response.status === 404) return null;
      const retry = Number(response.headers.get('Retry-After'));
      if (response.status === 429 || response.status >= 500)
        upstreamBlockedUntil =
          now() +
          (Number.isFinite(retry) && retry > 0 ? Math.min(retry, 3600) : 60) *
            1000;
      throw new Error('AniList unavailable');
    }
    const raw = await response.text();
    if (raw.length > 100_000) throw new Error('AniList response too large');
    const payload = record(JSON.parse(raw));
    if (Array.isArray(payload.errors) && payload.errors.length)
      throw new Error('AniList query failed');
    const media = record(payload.data).Media;
    const result = identity(media, id);
    if (result) {
      try {
        await db()
          .prepare(`INSERT INTO catalog_page_cache(cache_key,data,updated_at) VALUES(?,?,?)
          ON CONFLICT(cache_key) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at`)
          .bind(key, JSON.stringify(media), now())
          .run();
      } catch {
        /* Recognition still works if the metadata cache cannot be written. */
      }
    }
    return result;
  } catch (error) {
    if (signal.aborted) throw error;
    if (previous) return previous;
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}

async function aniListIdentity(id: number, signal: AbortSignal) {
  // Coalesce requests for the same immutable identifier; never cache browser-supplied titles.
  const existing = pending.get(id);
  if (existing) return existing;
  const request = loadIdentity(id, signal).finally(() => pending.delete(id));
  pending.set(id, request);
  return request;
}

const kinds: Record<string, string[]> = {
  TV: ['tv'],
  TV_SHORT: ['tv'],
  MOVIE: ['movie'],
  OVA: ['ova'],
  ONA: ['ona'],
  SPECIAL: ['special', 'tv_special'],
  MUSIC: ['music'],
};
export function matchCatalogIdentity(
  metadata: AniListIdentity,
  candidates: Anime[],
) {
  const byAniList = candidates.filter(
    (item) => Number(record(item).anilist_id) === metadata.id,
  );
  if (byAniList.length) return byAniList.length === 1 ? byAniList[0] : null;
  const byMal = metadata.idMal
    ? candidates.filter((item) => item.mal_id === metadata.idMal)
    : [];
  if (byMal.length) return byMal.length === 1 ? byMal[0] : null;
  // A title alone is insufficient: preserve season numbers, year and exact media format.
  if (!metadata.year || !kinds[metadata.format]) return null;
  const titles = new Set(
    metadata.primaryTitles.map(normalizeMatchTitle).filter(Boolean),
  );
  const matches = candidates.filter(
    (item) =>
      (!metadata.idMal || !item.mal_id || metadata.idMal === item.mal_id) &&
      kinds[metadata.format].includes(item.kind) &&
      Number(item.aired_on?.slice(0, 4)) === metadata.year &&
      [
        item.name,
        item.russian,
        ...(Array.isArray(record(item).matching_aliases)
          ? (record(item).matching_aliases as string[])
          : []),
      ].some((title) => titles.has(normalizeMatchTitle(title))),
  );
  return matches.length === 1 ? matches[0] : null;
}

export async function resolveSceneAnime(
  id: number,
  signal: AbortSignal,
): Promise<CatalogSceneMatch> {
  const direct = await db()
    .prepare(
      `SELECT data FROM anime_cache WHERE data::jsonb->>'anilist_id'=? LIMIT 2`,
    )
    .bind(String(id))
    .all<{ data: string }>();
  if (direct.results.length) {
    const anime =
      direct.results.length === 1
        ? (JSON.parse(direct.results[0].data) as Anime)
        : null;
    return {
      anilistId: id,
      ...(!anime && { unmatched: true }),
      anime: anime
        ? { id: anime.id, title: anime.russian || anime.name }
        : null,
    };
  }
  let metadata: AniListIdentity | null;
  try {
    metadata = await aniListIdentity(id, signal);
  } catch {
    return { anilistId: id, anime: null, unavailable: true };
  }
  if (!metadata) return { anilistId: id, anime: null };
  const titles = [
    ...new Set(metadata.titles.map(normalizeMatchTitle).filter(Boolean)),
  ];
  const rows = await db()
    .prepare(`SELECT a.data,m.aliases FROM anime_cache a
    LEFT JOIN anime_search_metadata m ON m.anime_id=a.id
    WHERE a.data::jsonb->>'mal_id'=? OR m.normalized_aliases && ?::text[]
      OR trim(regexp_replace(translate(lower(a.data::jsonb->>'name'),'ё','е'),'[^[:alnum:]]+',' ','g'))=ANY(?::text[])
      OR trim(regexp_replace(translate(lower(a.data::jsonb->>'russian'),'ё','е'),'[^[:alnum:]]+',' ','g'))=ANY(?::text[])
    LIMIT 101`)
    .bind(String(metadata.idMal || ''), titles, titles, titles)
    .all<{ data: string; aliases: unknown }>();
  // Do not resolve ambiguity using a truncated candidate set.
  const candidates =
    rows.results.length > 100
      ? []
      : rows.results.map(
          (row) =>
            ({
              ...JSON.parse(row.data),
              matching_aliases: Array.isArray(row.aliases) ? row.aliases : [],
            }) as Anime,
        );
  const anime = matchCatalogIdentity(metadata, candidates);
  return {
    anilistId: id,
    title: metadata.titles[0],
    ...(!anime && rows.results.length > 0 && { unmatched: true }),
    anime: anime ? { id: anime.id, title: anime.russian || anime.name } : null,
  };
}
