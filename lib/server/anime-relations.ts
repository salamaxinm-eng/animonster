import type { Anime } from '@/lib/anime';
import { compactAnime } from './anime';
import { db, now } from './core';
import {
  connectedRelationIds,
  normalizeRelationEdges,
  orderRelationIds,
  relationPathThrough,
} from './relation-graph';

const SHIKIMORI = 'https://shikimori.one/api/animes/';
const RELATION_TTL = 30 * 24 * 60 * 60 * 1000;
const MAINLINE = new Set(['Prequel', 'Sequel']);

type ShikimoriRelated = {
  relation: string;
  relation_russian?: string;
  anime?: {
    id: number;
    name?: string;
    russian?: string;
    kind?: string;
    aired_on?: string;
  };
};
type RelationRow = {
  anime_id: number;
  related_anime_id: number;
  relation: string;
  relation_russian: string;
};
type AnimeRow = { id: number; data: string };
export type RelationCard = {
  item: Anime;
  label: string;
  active?: boolean;
  branch?: boolean;
};
export type AnimeRelationsResult = {
  mainline: RelationCard[];
  branches: RelationCard[];
  related: RelationCard[];
};

export async function ensureRelationState(animeId: number) {
  await db()
    .prepare(
      `INSERT INTO anime_relation_state(anime_id) VALUES (?) ON CONFLICT(anime_id) DO NOTHING`,
    )
    .bind(animeId)
    .run();
}

async function fetchRelations(animeId: number) {
  const response = await fetch(`${SHIKIMORI}${animeId}/related`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'AniMonster/1.0 (+https://animonster.su)',
    },
    signal: AbortSignal.timeout(8000),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Shikimori HTTP ${response.status}`);
  return (await response.json()) as ShikimoriRelated[];
}

async function refreshOne(animeId: number) {
  try {
    const relations = await fetchRelations(animeId);
    await db()
      .prepare('DELETE FROM anime_relations WHERE anime_id=?')
      .bind(animeId)
      .run();
    for (const entry of relations) {
      const related = entry.anime;
      if (!related?.id || !entry.relation) continue;
      await db()
        .prepare(
          `INSERT INTO anime_relations(anime_id,related_anime_id,relation,relation_russian,related_title,related_kind,related_year,checked_at)
           VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(anime_id,related_anime_id,relation) DO UPDATE SET
           relation_russian=excluded.relation_russian,related_title=excluded.related_title,
           related_kind=excluded.related_kind,related_year=excluded.related_year,checked_at=excluded.checked_at`,
        )
        .bind(
          animeId,
          Number(related.id),
          entry.relation,
          entry.relation_russian || '',
          related.russian || related.name || '',
          related.kind || '',
          Number(String(related.aired_on || '').slice(0, 4)) || 0,
          now(),
        )
        .run();
    }
    await db()
      .prepare(
        `UPDATE anime_relation_state SET status=?,attempts=attempts+1,checked_at=?,last_error=NULL WHERE anime_id=?`,
      )
      .bind(relations.length ? 'ok' : 'not_found', now(), animeId)
      .run();
    return true;
  } catch (error) {
    await db()
      .prepare(
        `UPDATE anime_relation_state SET status='error',attempts=attempts+1,checked_at=?,last_error=? WHERE anime_id=?`,
      )
      .bind(
        now(),
        error instanceof Error ? error.message.slice(0, 300) : 'unknown',
        animeId,
      )
      .run();
    return false;
  }
}

export async function ensureAnimeRelationsFresh(animeId: number) {
  await ensureRelationState(animeId);
  const state = await db()
    .prepare(
      'SELECT status,checked_at FROM anime_relation_state WHERE anime_id=?',
    )
    .bind(animeId)
    .first<{ status: string; checked_at: number }>();
  if (
    !state ||
    state.status === 'pending' ||
    (state.status === 'error' && state.checked_at < now() - 15 * 60 * 1000) ||
    state.checked_at < now() - RELATION_TTL
  )
    await refreshOne(animeId);
}

export async function refreshAnimeRelations(limit = 12) {
  const safeLimit = Math.max(1, Math.min(30, Math.floor(limit)));
  const rows = await db()
    .prepare(
      `SELECT anime_id FROM anime_relation_state
       WHERE status='pending' OR (status='error' AND checked_at<?) OR checked_at<?
       ORDER BY checked_at,anime_id LIMIT ?`,
    )
    .bind(now() - 15 * 60 * 1000, now() - RELATION_TTL, safeLimit)
    .all<{ anime_id: number }>();
  let next = 0;
  const results = await Promise.all(
    Array.from({ length: Math.min(4, rows.results.length) }, async () => {
      const worker: boolean[] = [];
      while (next < rows.results.length)
        worker.push(await refreshOne(rows.results[next++].anime_id));
      return worker;
    }),
  );
  const flat = results.flat();
  return {
    processed: flat.length,
    completed: flat.filter(Boolean).length,
    failed: flat.filter((value) => !value).length,
  };
}

async function availableGraph() {
  const [relations, animeRows] = await Promise.all([
    db()
      .prepare(
        'SELECT anime_id,related_anime_id,relation,relation_russian FROM anime_relations',
      )
      .all<RelationRow>(),
    db().prepare('SELECT id,data FROM anime_cache').all<AnimeRow>(),
  ]);
  const anime = new Map<number, Anime>();
  for (const row of animeRows.results) {
    try {
      anime.set(Number(row.id), JSON.parse(row.data) as Anime);
    } catch {}
  }
  return {
    relations: relations.results.filter(
      (edge) => anime.has(edge.anime_id) && anime.has(edge.related_anime_id),
    ),
    anime,
  };
}

export async function animeRelations(
  animeId: number,
): Promise<AnimeRelationsResult> {
  await ensureAnimeRelationsFresh(animeId);
  const { relations, anime } = await availableGraph();
  if (!anime.has(animeId)) return { mainline: [], branches: [], related: [] };
  const edges = normalizeRelationEdges(relations);
  const ids = connectedRelationIds(animeId, edges);
  const years = new Map(
    [...anime].map(([id, item]) => [
      id,
      Number(item.aired_on?.slice(0, 4)) || 0,
    ]),
  );
  const { ordered, branching } = orderRelationIds(ids, edges, years);
  const path = branching
    ? relationPathThrough(animeId, ids, edges, years)
    : ordered;
  const pathSet = new Set(path);
  const currentIndex = path.indexOf(animeId);
  const mainline = path.map((id, index) => ({
    item: compactAnime([anime.get(id)!])[0],
    label: branching
      ? id === animeId
        ? 'Текущая часть'
        : index < currentIndex
          ? 'Предыдущая часть'
          : 'Продолжение'
      : anime.get(id)?.kind === 'movie'
        ? 'Фильм-продолжение'
        : `Сезон ${index + 1}`,
    active: id === animeId,
    branch: false,
  }));
  const branches = branching
    ? ordered
        .filter((id) => !pathSet.has(id))
        .map((id) => ({
          item: compactAnime([anime.get(id)!])[0],
          label: 'Альтернативное продолжение',
          branch: true,
        }))
    : [];
  const related = relations
    .filter((row) => row.anime_id === animeId && !MAINLINE.has(row.relation))
    .map((row) => ({
      item: compactAnime([anime.get(row.related_anime_id)!])[0],
      label: row.relation_russian || row.relation,
    }))
    .filter(
      (card, index, all) =>
        all.findIndex((other) => other.item.id === card.item.id) === index,
    );
  return { mainline, branches, related };
}

export async function groupSearchAnime(items: Anime[]) {
  const { relations, anime } = await availableGraph();
  const edges = normalizeRelationEdges(relations);
  const matched = new Set(items.map((item) => item.id));
  const consumed = new Set<number>();
  const groups: {
    type: 'franchise';
    id: string;
    title: string;
    items: RelationCard[];
  }[] = [];
  for (const item of items) {
    if (consumed.has(item.id)) continue;
    const ids = connectedRelationIds(item.id, edges);
    if (ids.size < 2) continue;
    const years = new Map(
      [...anime].map(([id, entry]) => [
        id,
        Number(entry.aired_on?.slice(0, 4)) || 0,
      ]),
    );
    const { ordered, branching } = orderRelationIds(ids, edges, years);
    const matchedIds = ordered.filter((id) => matched.has(id));
    if (!matchedIds.length) continue;
    matchedIds.forEach((id) => consumed.add(id));
    groups.push({
      type: 'franchise',
      id: `franchise-${ordered[0]}`,
      title: anime.get(ordered[0])?.russian || item.russian,
      items: ordered.map((id, index) => ({
        item: compactAnime([anime.get(id)!])[0],
        label: branching
          ? index
            ? 'Ветка продолжения'
            : 'Начало истории'
          : `Сезон ${index + 1}`,
        branch: branching && index > 0,
      })),
    });
  }
  return { groups, standalone: items.filter((item) => !consumed.has(item.id)) };
}
