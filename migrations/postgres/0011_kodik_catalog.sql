ALTER TABLE anime_cache ADD COLUMN IF NOT EXISTS primary_provider text NOT NULL DEFAULT 'aniliberty';
ALTER TABLE anime_cache ADD COLUMN IF NOT EXISTS search_text text NOT NULL DEFAULT '';
ALTER TABLE anime_cache ADD COLUMN IF NOT EXISTS kind_index text NOT NULL DEFAULT '';
ALTER TABLE anime_cache ADD COLUMN IF NOT EXISTS status_index text NOT NULL DEFAULT '';
ALTER TABLE anime_cache ADD COLUMN IF NOT EXISTS year_index integer NOT NULL DEFAULT 0;
ALTER TABLE anime_cache ADD COLUMN IF NOT EXISTS score_index double precision NOT NULL DEFAULT 0;
ALTER TABLE anime_cache ADD COLUMN IF NOT EXISTS genres_index jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE watch_sessions ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'aniliberty';
ALTER TABLE watch_sessions ADD COLUMN IF NOT EXISTS voiceover text NOT NULL DEFAULT 'aniliberty';

UPDATE anime_cache SET
  search_text=lower(concat_ws(' ',data::jsonb->>'russian',data::jsonb->>'name')),
  kind_index=COALESCE(data::jsonb->>'kind',''),
  status_index=COALESCE(data::jsonb->>'status',''),
  year_index=COALESCE(NULLIF(substring(data::jsonb->>'aired_on' from 1 for 4),''),'0')::integer,
  score_index=CASE WHEN data::jsonb->>'score' ~ '^[0-9]+([.][0-9]+)?$' THEN (data::jsonb->>'score')::double precision ELSE 0 END,
  genres_index=COALESCE(data::jsonb->'genres','[]'::jsonb)
WHERE search_text='';

CREATE INDEX anime_cache_catalog_rating ON anime_cache(score_index DESC,id);
CREATE INDEX anime_cache_catalog_year ON anime_cache(year_index DESC,id);
CREATE INDEX anime_cache_catalog_status ON anime_cache(status_index,score_index DESC);
CREATE INDEX anime_cache_catalog_kind ON anime_cache(kind_index,score_index DESC);
CREATE INDEX anime_cache_catalog_genres ON anime_cache USING gin(genres_index);
CREATE INDEX anime_cache_catalog_search ON anime_cache(search_text text_pattern_ops);

CREATE TABLE anime_sources (
  provider text NOT NULL,
  source_id text NOT NULL,
  anime_id integer NOT NULL REFERENCES anime_cache(id) ON DELETE CASCADE,
  shikimori_id integer,
  translation_id integer,
  translation_title text NOT NULL DEFAULT '',
  translation_type text NOT NULL DEFAULT 'voice' CHECK (translation_type IN ('voice','subtitles')),
  player_url text,
  episodes_count integer NOT NULL DEFAULT 0,
  payload text NOT NULL DEFAULT '{}',
  provider_updated_at bigint NOT NULL DEFAULT 0,
  last_seen_at bigint NOT NULL,
  active integer NOT NULL DEFAULT 1,
  PRIMARY KEY(provider,source_id)
);
CREATE INDEX anime_sources_anime ON anime_sources(anime_id,provider,active,translation_type);
CREATE INDEX anime_sources_shikimori ON anime_sources(shikimori_id,provider);

CREATE TABLE kodik_episode_links (
  anime_id integer NOT NULL REFERENCES anime_cache(id) ON DELETE CASCADE,
  translation_id integer NOT NULL,
  episode integer NOT NULL,
  player_url text NOT NULL,
  updated_at bigint NOT NULL,
  PRIMARY KEY(anime_id,translation_id,episode)
);

CREATE TABLE provider_sync_state (
  provider text PRIMARY KEY,
  phase text NOT NULL DEFAULT 'initial',
  cursor text,
  high_watermark bigint NOT NULL DEFAULT 0,
  full_sync_complete integer NOT NULL DEFAULT 0,
  imported integer NOT NULL DEFAULT 0,
  updated integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  last_started_at bigint,
  last_success_at bigint,
  last_error text
);

CREATE TABLE kodik_match_queue (
  source_id text PRIMARY KEY,
  title text NOT NULL,
  title_orig text NOT NULL DEFAULT '',
  year integer NOT NULL DEFAULT 0,
  kind text NOT NULL DEFAULT '',
  reason text NOT NULL,
  payload text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','linked','rejected')),
  matched_anime_id integer,
  updated_at bigint NOT NULL
);
CREATE INDEX kodik_match_queue_status ON kodik_match_queue(status,updated_at DESC);

CREATE TABLE anime_episode_availability (
  anime_id integer NOT NULL,
  episode integer NOT NULL,
  first_seen_at bigint NOT NULL,
  free_at bigint NOT NULL,
  PRIMARY KEY(anime_id,episode)
);
CREATE INDEX anime_episode_availability_free ON anime_episode_availability(free_at);

INSERT INTO anime_episode_availability(anime_id,episode,first_seen_at,free_at)
SELECT anime_id,episode,MIN(first_seen_at),MIN(free_at)
FROM episode_availability GROUP BY anime_id,episode
ON CONFLICT(anime_id,episode) DO NOTHING;
