import { db, now } from './core';
import { partitionTags, tagKey, uniqueTags } from '@/lib/anime-taxonomy';

export type TaxonomyEntry = { id: string; russian: string; kind: string };
const CACHE_KEY = 'taxonomy:shikimori:v1';
const TTL = 6 * 60 * 60 * 1000;
let memory: { entries: TaxonomyEntry[]; expiresAt: number } | undefined;
let pending: Promise<TaxonomyEntry[]> | undefined;

function validEntries(value: unknown): TaxonomyEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item) =>
        item &&
        typeof item.russian === 'string' &&
        item.russian.trim() &&
        ['genre', 'theme', 'demographic'].includes(item.kind),
    )
    .map((item) => ({
      id: String(item.id),
      russian: item.russian.trim(),
      kind: item.kind,
    }));
}

async function loadCatalog() {
  let previous = memory?.entries || [];
  try {
    const saved = await db()
      .prepare(
        'SELECT data,updated_at FROM catalog_page_cache WHERE cache_key=?',
      )
      .bind(CACHE_KEY)
      .first<{ data: string; updated_at: number }>();
    if (saved) {
      const entries = validEntries(JSON.parse(saved.data));
      if (entries.length) {
        previous = entries;
        if (Number(saved.updated_at) > now() - TTL) {
          memory = { entries, expiresAt: Number(saved.updated_at) + TTL };
          return entries;
        }
      }
    }
  } catch {}
  try {
    const response = await fetch('https://shikimori.one/api/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'AniMonster/1.0 (+https://animonster.su)',
      },
      body: JSON.stringify({
        query: 'query { genres(entryType: Anime) { id russian kind } }',
      }),
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Taxonomy HTTP ${response.status}`);
    const result = await response.json();
    const entries = validEntries(result.data?.genres);
    if (result.errors?.length || !entries.length)
      throw new Error('Empty taxonomy');
    memory = { entries, expiresAt: now() + TTL };
    try {
      await db()
        .prepare(`INSERT INTO catalog_page_cache(cache_key,data,updated_at) VALUES(?,?,?)
        ON CONFLICT(cache_key) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at`)
        .bind(CACHE_KEY, JSON.stringify(entries), now())
        .run();
    } catch {}

    return entries;
  } catch {
    memory = { entries: previous, expiresAt: now() + 5 * 60 * 1000 };
    return previous;
  }
}

export async function taxonomyCatalog() {
  if (memory && memory.expiresAt > now()) return memory.entries;
  if (!pending)
    pending = loadCatalog().finally(() => {
      pending = undefined;
    });
  return pending;
}

export async function animeTaxonomy() {
  const [entries, indexed] = await Promise.all([
    taxonomyCatalog(),
    db()
      .prepare(`SELECT DISTINCT name FROM (
      SELECT jsonb_array_elements_text(themes) AS name FROM anime_search_metadata WHERE jsonb_typeof(themes)='array'
      UNION SELECT jsonb_array_elements_text(themes::jsonb) AS name FROM anime_themes_cache WHERE status='ok'
    ) indexed_themes`)
      .all<{ name: string }>()
      .catch(() => ({ results: [] })),
  ]);
  const genres = new Set(
    entries
      .filter((entry) => entry.kind !== 'theme')
      .map((entry) => tagKey(entry.russian)),
  );
  const themes = uniqueTags([
    ...entries
      .filter((entry) => entry.kind === 'theme')
      .map((entry) => entry.russian),
    ...indexed.results
      .map((row) => row.name)
      .filter((name) => !genres.has(tagKey(name))),
  ]).sort((a, b) => a.localeCompare(b, 'ru'));
  return { entries, themes };
}

export async function genreEntries<T extends { name: string }>(items: T[]) {
  const { themes } = await animeTaxonomy();
  const allowed = new Set(
    partitionTags(
      items.map((item) => item.name),
      themes,
    ).genres.map(tagKey),
  );
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = tagKey(item.name);
    if (!allowed.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
