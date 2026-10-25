CREATE TABLE demo_player_feedback (
  subject text PRIMARY KEY,
  user_id text REFERENCES users(id) ON DELETE CASCADE,
  watched jsonb NOT NULL DEFAULT '{}'::jsonb CONSTRAINT demo_player_feedback_watched_object CHECK (jsonb_typeof(watched)='object'),
  score smallint CHECK (score BETWEEN 1 AND 10),
  comment text NOT NULL DEFAULT '' CHECK (char_length(comment)<=2000),
  submitted_at bigint,
  dismissed_until bigint NOT NULL DEFAULT 0,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL
);
CREATE INDEX demo_player_feedback_submitted ON demo_player_feedback(submitted_at DESC) WHERE submitted_at IS NOT NULL;
