ALTER TABLE anime_search_metadata
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

UPDATE anime_search_metadata
SET status='pending'
WHERE version < 2;
