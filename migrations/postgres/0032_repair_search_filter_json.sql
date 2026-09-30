-- The postgres driver serializes a bound JSON string again for ?::jsonb.
-- Rebuild the genre index from the canonical anime payload and repair aliases.
UPDATE anime_cache
SET genres_index = CASE
  WHEN jsonb_typeof(data::jsonb->'genres') = 'array' THEN data::jsonb->'genres'
  ELSE '[]'::jsonb
END
WHERE jsonb_typeof(genres_index) <> 'array';

UPDATE anime_search_metadata
SET aliases = (aliases #>> '{}')::jsonb
WHERE jsonb_typeof(aliases) = 'string';
