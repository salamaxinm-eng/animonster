import { cache } from 'react';
import { db } from './core';
import { tagKey, themeName } from '@/lib/anime-taxonomy';

// Only local, persisted classification is used. A DB failure must propagate;
// treating a failed taxonomy lookup as an unknown theme would create a false 404.
export const themeLandings = cache(async (): Promise<string[]> => {
  const [taxonomy, tags] = await Promise.all([
    db()
      .prepare('SELECT data FROM catalog_page_cache WHERE cache_key=?')
      .bind('taxonomy:shikimori:v1')
      .first<{ data: string }>(),
    db()
      .prepare(`SELECT DISTINCT tag.name,tag.indexed
      FROM anime_cache a
      LEFT JOIN anime_search_metadata m ON m.anime_id=a.id
      LEFT JOIN anime_themes_cache t ON t.anime_id=a.id AND t.status='ok'
      CROSS JOIN LATERAL (
        SELECT jsonb_array_elements_text(COALESCE(m.themes,'[]'::jsonb) || COALESCE(t.themes::jsonb,'[]'::jsonb)) AS name,true AS indexed
        UNION SELECT jsonb_array_elements_text(a.genres_index),false
      ) tag
      WHERE a.id>0 AND a.data::jsonb->>'id'=a.id::text
        AND COALESCE(NULLIF(a.data::jsonb->>'russian',''),NULLIF(a.data::jsonb->>'name','')) IS NOT NULL
        AND tag.name<>''`)
      .all<{ name: string; indexed: boolean }>(),
  ]);
  const entries: { russian: string; kind: string }[] = taxonomy
    ? JSON.parse(taxonomy.data)
    : [];
  const genres = new Set(
    entries.filter((x) => x.kind !== 'theme').map((x) => tagKey(x.russian)),
  );
  const known = new Set(
    entries.filter((x) => x.kind === 'theme').map((x) => tagKey(x.russian)),
  );
  for (const tag of tags.results)
    if (tag.indexed && !genres.has(tagKey(tag.name)))
      known.add(tagKey(tag.name));
  return [
    ...new Set(
      tags.results
        .filter((x) => known.has(tagKey(x.name)))
        .map((x) => themeName(x.name)),
    ),
  ].sort((a, b) => a.localeCompare(b, 'ru'));
});

// Correlated with anime_cache a. Do not use provider episode counts, free search
// or combinations of filters to generate indexable landing pages.
export const THEME_MATCH_SQL = `EXISTS (
  SELECT 1 FROM jsonb_array_elements_text(
    COALESCE((SELECT m.themes FROM anime_search_metadata m WHERE m.anime_id=a.id),'[]'::jsonb)
    || COALESCE((SELECT t.themes::jsonb FROM anime_themes_cache t WHERE t.anime_id=a.id AND t.status='ok'),'[]'::jsonb)
    || a.genres_index
  ) tag(name)
  WHERE replace(regexp_replace(lower(trim(tag.name)),'\\s+',' ','g'),'ё','е') IN (?,?)
)`;
