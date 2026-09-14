CREATE TABLE anime_themes_cache (
  anime_id integer PRIMARY KEY,
  themes text NOT NULL DEFAULT '[]',
  status text NOT NULL CHECK (status IN ('ok', 'not_found', 'error')),
  checked_at bigint NOT NULL
);
