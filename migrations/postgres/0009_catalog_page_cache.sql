CREATE TABLE catalog_page_cache (
  cache_key text PRIMARY KEY,
  data text NOT NULL,
  total_count integer NOT NULL DEFAULT 0,
  total_pages integer NOT NULL DEFAULT 1,
  updated_at bigint NOT NULL
);
