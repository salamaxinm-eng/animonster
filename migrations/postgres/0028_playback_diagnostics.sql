CREATE TABLE playback_diagnostics (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('kodik')),
  anime_id integer NOT NULL,
  episode integer NOT NULL,
  voiceover text NOT NULL,
  code text NOT NULL,
  phase text NOT NULL,
  details text NOT NULL DEFAULT '{}',
  user_agent text NOT NULL DEFAULT '',
  created_at bigint NOT NULL
);

CREATE INDEX playback_diagnostics_user_created
  ON playback_diagnostics(user_id, created_at DESC);
CREATE INDEX playback_diagnostics_code_created
  ON playback_diagnostics(code, created_at DESC);
