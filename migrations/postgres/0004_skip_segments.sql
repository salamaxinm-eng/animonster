ALTER TABLE users
  ADD COLUMN auto_skip_segments integer CHECK (auto_skip_segments IN (0, 1));

CREATE TABLE skip_time_cache (
  mal_id integer NOT NULL,
  episode integer NOT NULL,
  duration integer NOT NULL,
  opening_start double precision,
  opening_stop double precision,
  ending_start double precision,
  ending_stop double precision,
  source text NOT NULL,
  confidence text NOT NULL CHECK (confidence IN ('exact', 'matched', 'unverified')),
  found integer NOT NULL DEFAULT 1 CHECK (found IN (0, 1)),
  updated_at bigint NOT NULL,
  PRIMARY KEY (mal_id, episode, duration)
);

CREATE TABLE skip_time_overrides (
  id text PRIMARY KEY,
  anime_id integer NOT NULL,
  episode integer NOT NULL,
  voiceover text NOT NULL DEFAULT '*',
  opening_start double precision,
  opening_stop double precision,
  ending_start double precision,
  ending_stop double precision,
  created_by text NOT NULL REFERENCES users(id),
  updated_at bigint NOT NULL,
  UNIQUE (anime_id, episode, voiceover)
);

CREATE INDEX skip_time_overrides_lookup
  ON skip_time_overrides(anime_id, episode, voiceover);
