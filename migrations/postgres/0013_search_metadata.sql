CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE anime_search_metadata (
  anime_id integer PRIMARY KEY REFERENCES anime_cache(id) ON DELETE CASCADE,
  aliases jsonb NOT NULL DEFAULT '[]'::jsonb,
  normalized_aliases text[] NOT NULL DEFAULT ARRAY[]::text[],
  normalized_titles text NOT NULL DEFAULT '',
  themes jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ok','not_found','error')),
  attempts integer NOT NULL DEFAULT 0,
  checked_at bigint NOT NULL DEFAULT 0,
  last_error text
);

INSERT INTO anime_search_metadata(anime_id,aliases,normalized_aliases,normalized_titles)
SELECT id,
  jsonb_build_array(COALESCE(data::jsonb->>'russian',''),COALESCE(data::jsonb->>'name','')),
  ARRAY[
    trim(regexp_replace(translate(lower(COALESCE(data::jsonb->>'russian','')),'ё','е'),'[^[:alnum:]]+',' ','g')),
    trim(regexp_replace(translate(lower(COALESCE(data::jsonb->>'name','')),'ё','е'),'[^[:alnum:]]+',' ','g'))
  ],
  trim(regexp_replace(translate(lower(concat_ws(' ',data::jsonb->>'russian',data::jsonb->>'name')),'ё','е'),'[^[:alnum:]]+',' ','g'))
FROM anime_cache
ON CONFLICT(anime_id) DO NOTHING;

CREATE INDEX anime_search_metadata_titles_trgm
  ON anime_search_metadata USING gin(normalized_titles gin_trgm_ops);
CREATE INDEX anime_search_metadata_status
  ON anime_search_metadata(status,checked_at,anime_id);
