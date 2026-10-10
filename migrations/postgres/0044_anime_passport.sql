CREATE TABLE passport_settings (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  is_public integer NOT NULL DEFAULT 0 CHECK (is_public IN (0,1)),
  favorite_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  award_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at bigint NOT NULL
);

CREATE INDEX qualified_episode_views_passport_date
  ON qualified_episode_views(user_id,qualified_at)
  WHERE qualified_at IS NOT NULL;

-- Install provenance tracking even on installations without the optional admin timer.
CREATE TABLE IF NOT EXISTS admin_watch_simulations (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  anime_id integer NOT NULL,
  interval_ms bigint NOT NULL DEFAULT 3600000 CHECK(interval_ms>=3600000),
  next_run_at bigint NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  UNIQUE(user_id,anime_id)
);
CREATE TABLE IF NOT EXISTS admin_watch_simulation_events (
  job_id text NOT NULL REFERENCES admin_watch_simulations(id) ON DELETE CASCADE,
  episode integer NOT NULL,
  added_at bigint NOT NULL,
  PRIMARY KEY(job_id,episode)
);
