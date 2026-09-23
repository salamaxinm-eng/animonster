import type { Anime, Episode } from '@/lib/anime';
import { db, now } from './core';
export const LIBERTY = (
  process.env.ANILIBERTY_API_URL || 'https://api.anilibria.app'
).replace(/\/+$/, '');
const LIBERTY_TIMEOUT = 4500;
const LIBERTY_STALE_TTL = 24 * 60 * 60 * 1000;
type LibertyCacheEntry = { value: unknown; updatedAt: number };
const libertyCacheState = globalThis as typeof globalThis & {
  __animonsterLibertyCache?: Map<string, LibertyCacheEntry>;
};
const libertyCache = (libertyCacheState.__animonsterLibertyCache ??= new Map());
export type Release = {
  id: number;
  name: { main: string; english: string };
  alias: string;
  poster: { src: string };
  shikimori?: { id: number; rating: number };
  mal?: { id: number; rating?: number };
  type: { value: string };
  publish_status?: { value?: string } | string;
  year: number;
  episodes_total: number;
  description: string;
  genres: { name: string }[];
  added_in_users_favorites: number;
  is_blocked_by_geo: boolean;
  is_blocked_by_copyrights: boolean;
  age_rating?: {
    value: string;
    label: string;
    is_adult: boolean;
    description: string;
  };
  episodes?: Episode[];
};
export async function liberty(path: string) {
  const started = performance.now();
  let lastError = 'Источник временно недоступен';
  try {
    const r = await fetch(LIBERTY + '/api/v1' + path, {
      signal: AbortSignal.timeout(LIBERTY_TIMEOUT),
      next: { revalidate: 300 },
    });
    if (!r.ok) lastError = `HTTP ${r.status}`;
    else {
      const value = await r.json();
      libertyCache.set(path, { value, updatedAt: Date.now() });
      void providerHealth('ok', Math.round(performance.now() - started));
      return value as any;
    }
  } catch (reason) {
    lastError = reason instanceof Error ? reason.message : lastError;
  }
  void providerHealth(
    'error',
    Math.round(performance.now() - started),
    lastError,
  );
  const stale = libertyCache.get(path);
  if (stale && stale.updatedAt > Date.now() - LIBERTY_STALE_TTL)
    return stale.value as any;
  throw Error('Источник временно недоступен');
}

async function providerHealth(
  status: 'ok' | 'error',
  latency: number,
  error?: string,
) {
  try {
    await db()
      .prepare(
        'INSERT INTO provider_health(provider,status,latency_ms,error,checked_at) VALUES (?,?,?,?,?) ON CONFLICT(provider) DO UPDATE SET status=excluded.status,latency_ms=excluded.latency_ms,error=excluded.error,checked_at=excluded.checked_at',
      )
      .bind('aniliberty', status, latency, error || null, now())
      .run();
  } catch {}
}
export const available = (r: Release) =>
  !r.is_blocked_by_geo && !r.is_blocked_by_copyrights;
export function compactAnime(items: Anime[]) {
  return items.map((item) => {
    const compact = { ...item };
    delete compact.description;
    return compact;
  });
}
export async function findRelease(id: number): Promise<Release | undefined> {
  if (id >= 100000000 && id < 101000000) {
    const release: Release = await liberty(
      '/anime/releases/' + (id - 100000000),
    );
    return normalize(release).id === id ? release : undefined;
  }
  const response = await fetch('https://shikimori.one/api/animes/' + id, {
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return;
  const anime = (await response.json()) as { name: string };
  const candidates: Release[] = await liberty(
    '/app/search/releases?query=' + encodeURIComponent(anime.name),
  );
  return candidates.find((release) => release.shikimori?.id === id);
}
export function normalize(r: Release): Anime {
  const publishStatus =
    typeof r.publish_status === 'string'
      ? r.publish_status
      : r.publish_status?.value;
  return {
    id: r.shikimori?.id || 100000000 + r.id,
    release_id: r.id,
    shikimori_id: r.shikimori?.id,
    mal_id: r.mal?.id,
    russian: r.name.main,
    name: r.name.english || r.name.main,
    image: { original: new URL(r.poster.src, LIBERTY).href },
    score: r.shikimori?.rating ? String(r.shikimori.rating) : '—',
    kind: r.type.value === 'MOVIE' ? 'movie' : 'tv',
    episodes: r.episodes_total || r.episodes?.length || 0,
    aired_on: String(r.year),
    description: r.description,
    genres: r.genres?.map((x) => x.name) || [],
    popularity: r.added_in_users_favorites || 0,
    age_rating: r.age_rating?.label,
    is_adult: !!r.age_rating?.is_adult,
    age_rating_source: r.age_rating ? 'aniliberty' : undefined,
    primary_provider: 'aniliberty',
    providers: ['aniliberty'],
    status:
      publishStatus === 'IS_ONGOING'
        ? 'ongoing'
        : publishStatus === 'IS_NOT_YET_RELEASED'
          ? 'anons'
          : publishStatus
            ? 'released'
            : '',
  };
}
