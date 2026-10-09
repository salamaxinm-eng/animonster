-- Administrative simulated watch progress. No player/session or referral activity is fabricated.
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
