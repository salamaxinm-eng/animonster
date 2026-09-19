import type { Anime } from '@/lib/anime';
import { db, now } from './core';
import {
  normalizeMatchTitle,
  type ShikimoriAnimeCandidate,
} from './shikimori-matching';

const ENDPOINT = 'https://shikimori.one/api/graphql';
const QUERY = `query ($ids: String!) {
  animes(ids: $ids, limit: 50) {
    id name russian synonyms airedOn { date } poster { originalUrl }
    genres { russian kind }
  }
}`;

export async function ensureSearchMetadata(anime: Anime) {
  const aliases = [...new Set([anime.russian, anime.name].filter(Boolean))];
  const normalized = aliases.map(normalizeMatchTitle).filter(Boolean);
  await db()
    .prepare(
      `INSERT INTO anime_search_metadata(anime_id,aliases,normalized_aliases,normalized_titles,status)
       VALUES (?,?::jsonb,?::text[],?,'pending')
       ON CONFLICT(anime_id) DO UPDATE SET
       aliases=CASE WHEN anime_search_metadata.status='ok' THEN anime_search_metadata.aliases ELSE excluded.aliases END,
       normalized_aliases=CASE WHEN anime_search_metadata.status='ok' THEN anime_search_metadata.normalized_aliases ELSE excluded.normalized_aliases END,
       normalized_titles=CASE WHEN anime_search_metadata.status='ok' THEN anime_search_metadata.normalized_titles ELSE excluded.normalized_titles END`,
    )
    .bind(anime.id, JSON.stringify(aliases), normalized, normalized.join(' '))
    .run();
}

type PendingRow = { anime_id: number; data: string };

async function fetchCandidates(ids: number[]) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'AniMonster/1.0 (+https://animonster.su)',
    },
    body: JSON.stringify({ query: QUERY, variables: { ids: ids.join(',') } }),
    signal: AbortSignal.timeout(8000),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Shikimori HTTP ${response.status}`);
  const payload = (await response.json()) as {
    data?: { animes?: ShikimoriAnimeCandidate[] };
    errors?: unknown[];
  };
  if (payload.errors?.length) throw new Error('Shikimori GraphQL error');
  return payload.data?.animes || [];
}

export async function refreshSearchMetadata(limit = 40) {
  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  const rows = await db()
    .prepare(
      `SELECT m.anime_id,a.data FROM anime_search_metadata m
       JOIN anime_cache a ON a.id=m.anime_id
       WHERE m.version<2 OR m.status='pending' OR (m.status='error' AND m.checked_at<?)
       ORDER BY m.checked_at,m.anime_id LIMIT ?`,
    )
    .bind(now() - 15 * 60 * 1000, safeLimit)
    .all<PendingRow>();
  if (!rows.results.length) return { processed: 0, completed: 0, failed: 0 };

  const identities = rows.results.map((row) => {
    const anime = JSON.parse(row.data) as Anime;
    return {
      row,
      anime,
      shikimoriId: anime.shikimori_id || (anime.id < 100000000 ? anime.id : 0),
    };
  });
  const ids = identities.map((item) => item.shikimoriId).filter(Boolean);
  try {
    const candidates = await fetchCandidates(ids);
    const byId = new Map(candidates.map((item) => [Number(item.id), item]));
    let completed = 0;
    for (const identity of identities) {
      const candidate = byId.get(identity.shikimoriId);
      const aliases = [
        identity.anime.russian,
        identity.anime.name,
        candidate?.russian,
        candidate?.name,
        ...(candidate?.synonyms || []),
      ].filter((value): value is string => !!value?.trim());
      const uniqueAliases = [...new Set(aliases)];
      const normalized = [
        ...new Set(uniqueAliases.map(normalizeMatchTitle).filter(Boolean)),
      ];
      const themes = (candidate?.genres || [])
        .filter((genre) => genre.kind === 'theme' && genre.russian?.trim())
        .map((genre) => genre.russian!.trim());
      if (candidate) {
        const repaired: Anime = {
          ...identity.anime,
          russian: candidate.russian?.trim() || identity.anime.russian,
          name: candidate.name?.trim() || identity.anime.name,
          aired_on: candidate.airedOn?.date?.trim() || identity.anime.aired_on,
          image: {
            original:
              candidate.poster?.originalUrl?.trim() ||
              identity.anime.image.original,
          },
        };
        await db()
          .prepare(
            `UPDATE anime_cache SET data=?,search_text=?,year_index=? WHERE id=?`,
          )
          .bind(
            JSON.stringify(repaired),
            `${repaired.russian} ${repaired.name}`.toLocaleLowerCase('ru-RU'),
            Number(String(repaired.aired_on || '').slice(0, 4)) || 0,
            repaired.id,
          )
          .run();
      }
      await db()
        .prepare(
          `UPDATE anime_search_metadata SET aliases=?::jsonb,normalized_aliases=?::text[],
           normalized_titles=?,themes=?::jsonb,status=?,version=2,attempts=attempts+1,checked_at=?,last_error=NULL
           WHERE anime_id=?`,
        )
        .bind(
          JSON.stringify(uniqueAliases),
          normalized,
          normalized.join(' '),
          JSON.stringify([...new Set(themes)]),
          candidate ? 'ok' : 'not_found',
          now(),
          identity.anime.id,
        )
        .run();
      if (candidate) completed++;
    }
    return {
      processed: identities.length,
      completed,
      failed: identities.length - completed,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message.slice(0, 300) : 'unknown';
    await Promise.all(
      identities.map((identity) =>
        db()
          .prepare(
            `UPDATE anime_search_metadata SET status='error',attempts=attempts+1,checked_at=?,last_error=? WHERE anime_id=?`,
          )
          .bind(now(), message, identity.anime.id)
          .run(),
      ),
    );
    return {
      processed: identities.length,
      completed: 0,
      failed: identities.length,
    };
  }
}

export async function searchMetadataStats() {
  const row = await db()
    .prepare(
      `SELECT
       (SELECT count(*) FROM anime_cache) AS catalog_total,
       count(*) AS indexed_total,
       count(*) FILTER (WHERE status='ok') AS completed,
       count(*) FILTER (WHERE status='not_found') AS not_found,
       count(*) FILTER (WHERE status='pending') AS pending,
       count(*) FILTER (WHERE status='error') AS errors,
       count(*) FILTER (WHERE jsonb_array_length(themes)>0) AS with_themes
       FROM anime_search_metadata`,
    )
    .first<Record<string, number>>();
  const catalog = Number(row?.catalog_total || 0);
  const terminal = Number(row?.completed || 0) + Number(row?.not_found || 0);
  return {
    catalog,
    indexed: Number(row?.indexed_total || 0),
    completed: Number(row?.completed || 0),
    not_found: Number(row?.not_found || 0),
    pending: Number(row?.pending || 0),
    errors: Number(row?.errors || 0),
    with_themes: Number(row?.with_themes || 0),
    coverage_percent: catalog
      ? Math.round((terminal / catalog) * 10000) / 100
      : 100,
  };
}
