import type { Anime } from '@/lib/anime';
import { db, now, runtime } from './core';
import { syncEpisodeAccess } from './episode-access';
import { saveAnime } from './library';
import { queueEpisodeNotifications } from './episode-notifications';
import {
  allowedKodikResult,
  comparable,
  kodikCatalogPage,
  rememberKodikSources,
  type KodikMaterialData,
  type KodikResult,
} from './kodik';

type ShikimoriCandidate = {
  id: number;
  name: string;
  russian?: string;
  kind?: string;
  aired_on?: string;
  image?: { original?: string };
  score?: string;
  episodes?: number;
  episodes_aired?: number;
  status?: string;
};

type SyncState = {
  phase: string;
  cursor: string | null;
  high_watermark: number;
  full_sync_complete: number;
  imported: number;
  updated: number;
  skipped: number;
};

const shikimoriHeaders = {
  Accept: 'application/json',
  'User-Agent': 'AniMonster catalog sync support@animonster.su',
};

async function shikimori(path: string) {
  const response = await fetch('https://shikimori.one/api' + path, {
    headers: shikimoriHeaders,
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Shikimori HTTP ${response.status}`);
  return response.json();
}

function compatibleKind(kodik: string, shikimori: string | undefined) {
  const movie = kodik === 'anime' || kodik === 'movie';
  return movie ? shikimori === 'movie' : shikimori !== 'movie';
}

async function matchShikimori(item: KodikResult) {
  const exact = Number(item.shikimori_id);
  if (Number.isInteger(exact) && exact > 0 && exact < 100000000) return exact;
  const title = String(item.title_orig || item.material_data?.title_en || '').trim();
  const year = Number(item.year || item.material_data?.year);
  if (!title || !year) return null;
  const candidates = (await shikimori(
    `/animes?limit=10&order=popularity&search=${encodeURIComponent(title)}`,
  )) as ShikimoriCandidate[];
  const wanted = comparable(title);
  const matches = candidates.filter(
    (candidate) =>
      [candidate.name, candidate.russian]
        .filter(Boolean)
        .some((value) => comparable(String(value)) === wanted) &&
      Number(String(candidate.aired_on || '').slice(0, 4)) === year &&
      compatibleKind(item.type || '', candidate.kind),
  );
  return matches.length === 1 ? Number(matches[0].id) : null;
}

function durationSeconds(data: KodikMaterialData | undefined) {
  const value = Number(data?.duration);
  if (!Number.isFinite(value) || value <= 0) return 24 * 60;
  const seconds = value <= 300 ? value * 60 : value;
  return seconds >= 60 && seconds <= 4 * 60 * 60
    ? Math.round(seconds)
    : 24 * 60;
}

function ageRating(data: KodikMaterialData | undefined) {
  if (data?.minimal_age) return `${data.minimal_age}+`;
  return data?.rating_mpaa || undefined;
}

function kind(item: KodikResult) {
  return item.material_data?.anime_kind === 'movie' || item.type === 'anime'
    ? 'movie'
    : 'tv';
}

function providerUpdatedAt(item: KodikResult) {
  return Date.parse(item.updated_at || '') || now();
}

async function existingAnime(id: number) {
  const row = await db()
    .prepare('SELECT data,episodes FROM anime_cache WHERE id=?')
    .bind(id)
    .first<{ data: string; episodes: string }>();
  if (!row) return null;
  try {
    return {
      anime: JSON.parse(row.data) as Anime,
      episodes: JSON.parse(row.episodes) as { ordinal: number; duration: number }[],
    };
  } catch {
    return null;
  }
}

function normalizeKodikAnime(
  item: KodikResult,
  animeId: number,
  current?: Anime,
): Anime | null {
  const data = item.material_data;
  const russian = String(data?.anime_title || data?.title || item.title || '').trim();
  const name = String(data?.title_en || item.title_orig || russian).trim();
  const poster = String(data?.poster_url || current?.image?.original || '').trim();
  if (!russian || !name || !poster || !/^https:\/\//i.test(poster)) return null;
  const providers = [...new Set(['kodik', ...(current?.providers || [])])] as (
    | 'kodik'
    | 'aniliberty'
  )[];
  return {
    ...current,
    id: animeId,
    shikimori_id: animeId,
    russian,
    name,
    image: { original: poster },
    score: String(data?.shikimori_rating || current?.score || '—'),
    kind: kind(item),
    episodes: Math.max(
      Number(item.episodes_count || item.last_episode) || 0,
      Number(data?.episodes_aired || data?.episodes_total) || 0,
      current?.episodes || 0,
    ),
    aired_on: String(data?.year || item.year || current?.aired_on || ''),
    description:
      data?.anime_description || data?.description || current?.description || '',
    genres: data?.anime_genres || data?.genres || current?.genres || [],
    age_rating: ageRating(data) || current?.age_rating,
    is_adult:
      Number(data?.minimal_age || 0) >= 18 ||
      ['R+', 'Rx'].includes(String(data?.rating_mpaa || '')) ||
      !!current?.is_adult,
    status: data?.anime_status || current?.status || '',
    primary_provider: 'kodik',
    providers,
  };
}

async function queueMatch(item: KodikResult, reason: string) {
  const id = String(item.id || crypto.randomUUID());
  await db()
    .prepare(
      `INSERT INTO kodik_match_queue(source_id,title,title_orig,year,kind,reason,payload,status,updated_at)
       VALUES (?,?,?,?,?,?,?,'pending',?) ON CONFLICT(source_id) DO UPDATE SET title=excluded.title,
       title_orig=excluded.title_orig,year=excluded.year,kind=excluded.kind,reason=excluded.reason,
       payload=excluded.payload,updated_at=excluded.updated_at WHERE kodik_match_queue.status='pending'`,
    )
    .bind(
      id,
      String(item.title || item.material_data?.anime_title || ''),
      String(item.title_orig || item.material_data?.title_en || ''),
      Number(item.year || item.material_data?.year) || 0,
      String(item.type || ''),
      reason,
      JSON.stringify(item),
      now(),
    )
    .run();
}

async function importItem(item: KodikResult, allowLookup: boolean, baseline: boolean) {
  if (!allowedKodikResult(item)) return { skipped: 1, imported: 0, updated: 0 };
  let animeId = Number(item.shikimori_id);
  if (!Number.isInteger(animeId) || animeId < 1 || animeId >= 100000000) {
    if (!allowLookup) {
      await queueMatch(item, 'Ожидает автоматического сопоставления');
      return { skipped: 1, imported: 0, updated: 0 };
    }
    try {
      animeId = (await matchShikimori(item)) || 0;
    } catch {
      animeId = 0;
    }
  }
  if (!animeId) {
    await queueMatch(item, 'Нет однозначного совпадения Shikimori');
    return { skipped: 1, imported: 0, updated: 0 };
  }
  item.shikimori_id = animeId;
  const existing = await existingAnime(animeId);
  const anime = normalizeKodikAnime(item, animeId, existing?.anime);
  if (!anime) {
    await queueMatch(item, 'Недостаточно метаданных или отсутствует HTTPS-постер');
    return { skipped: 1, imported: 0, updated: 0 };
  }
  const count = Math.max(1, anime.episodes || 1);
  const duration = durationSeconds(item.material_data);
  const episodes = Array.from({ length: count }, (_, index) => ({
    ordinal: index + 1,
    duration,
  }));
  const known = new Set((existing?.episodes || []).map((episode) => episode.ordinal));
  await saveAnime(anime, episodes);
  await rememberKodikSources(animeId, [item]);
  const access = await syncEpisodeAccess(
    animeId,
    'kodik',
    episodes.map((episode) => episode.ordinal),
    baseline,
  );
  if (!baseline) {
    await queueEpisodeNotifications(
      animeId,
      episodes.map((episode) => episode.ordinal).filter((episode) => !known.has(episode)),
      access,
    );
  }
  return existing
    ? { skipped: 0, imported: 0, updated: 1 }
    : { skipped: 0, imported: 1, updated: 0 };
}

export async function linkQueuedKodik(sourceId: string, animeId: number) {
  const row = await db()
    .prepare("SELECT payload FROM kodik_match_queue WHERE source_id=? AND status='pending'")
    .bind(sourceId)
    .first<{ payload: string }>();
  if (!row) throw new Error('Материал не найден в очереди');
  const item = JSON.parse(row.payload) as KodikResult;
  item.shikimori_id = animeId;
  const result = await importItem(item, false, true);
  if (!result.imported && !result.updated) throw new Error('Материал не удалось связать');
  await db()
    .prepare("UPDATE kodik_match_queue SET status='linked',matched_anime_id=?,updated_at=? WHERE source_id=?")
    .bind(animeId, now(), sourceId)
    .run();
  return result;
}

export async function runKodikSync(pageLimit = 5) {
  if (runtime().KODIK_SYNC_ENABLED !== 'true')
    return { ok: true, disabled: true, imported: 0, updated: 0, skipped: 0 };
  const started = now();
  const state =
    (await db()
      .prepare('SELECT * FROM provider_sync_state WHERE provider=?')
      .bind('kodik')
      .first<SyncState>()) ||
    ({
      phase: 'initial',
      cursor: null,
      high_watermark: 0,
      full_sync_complete: 0,
      imported: 0,
      updated: 0,
      skipped: 0,
    } as SyncState);
  await db()
    .prepare(
      `INSERT INTO provider_sync_state(provider,last_started_at) VALUES ('kodik',?)
       ON CONFLICT(provider) DO UPDATE SET last_started_at=excluded.last_started_at,last_error=NULL`,
    )
    .bind(started)
    .run();
  let cursor = state.phase === 'initial' ? state.cursor : null;
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let lookups = 0;
  let highWatermark = state.high_watermark;
  try {
    let reachedWatermark = false;
    for (let page = 0; page < Math.max(1, Math.min(5, pageLimit)); page++) {
      const response = await kodikCatalogPage(
        cursor,
        state.phase === 'initial' ? 'asc' : 'desc',
      );
      for (const item of response.results) {
        const timestamp = providerUpdatedAt(item);
        highWatermark = Math.max(highWatermark, timestamp);
        if (
          state.phase !== 'initial' &&
          state.high_watermark > 0 &&
          timestamp <= state.high_watermark
        ) {
          cursor = null;
          reachedWatermark = true;
          break;
        }
        const allowLookup = !Number(item.shikimori_id) && lookups++ < 10;
        const result = await importItem(
          item,
          allowLookup,
          state.phase === 'initial',
        );
        imported += result.imported;
        updated += result.updated;
        skipped += result.skipped;
      }
      if (reachedWatermark) break;
      cursor = response.cursor;
      if (!cursor) break;
    }
    const completedInitial = state.phase === 'initial' && !cursor;
    await db()
      .prepare(
        `UPDATE provider_sync_state SET phase=?,cursor=?,high_watermark=?,full_sync_complete=?,
         imported=imported+?,updated=updated+?,skipped=skipped+?,last_success_at=?,last_error=NULL WHERE provider='kodik'`,
      )
      .bind(
        completedInitial ? 'incremental' : state.phase,
        completedInitial ? null : cursor,
        highWatermark,
        completedInitial || state.full_sync_complete ? 1 : 0,
        imported,
        updated,
        skipped,
        now(),
      )
      .run();
    return {
      ok: true,
      phase: completedInitial ? 'incremental' : state.phase,
      cursor: !!cursor,
      imported,
      updated,
      skipped,
      initial_complete: completedInitial || !!state.full_sync_complete,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    await db()
      .prepare("UPDATE provider_sync_state SET last_error=? WHERE provider='kodik'")
      .bind(message.slice(0, 500))
      .run();
    throw error;
  }
}
