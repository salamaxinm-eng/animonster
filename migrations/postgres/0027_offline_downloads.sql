CREATE TABLE offline_downloads (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  anime_id integer NOT NULL,
  episode integer NOT NULL,
  quality integer NOT NULL CHECK (quality IN (480,720,1080)),
  provider text NOT NULL CHECK (provider IN ('aniliberty')),
  status text NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared','completed','deleted','failed')),
  created_at bigint NOT NULL,
  completed_at bigint,
  updated_at bigint NOT NULL
);
CREATE INDEX offline_downloads_user_created ON offline_downloads(user_id,created_at DESC);

CREATE TABLE offline_prepare_limits (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  attempts integer NOT NULL DEFAULT 0,
  window_started bigint NOT NULL
);
