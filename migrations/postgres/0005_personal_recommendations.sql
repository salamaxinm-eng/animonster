CREATE TABLE user_recommendation_state (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  dirty integer NOT NULL DEFAULT 1 CHECK (dirty IN (0, 1)),
  dirty_at bigint NOT NULL,
  last_computed_at bigint,
  algorithm_version integer NOT NULL DEFAULT 0,
  locked_until bigint,
  last_error text
);

CREATE INDEX user_recommendation_state_work
  ON user_recommendation_state(dirty, dirty_at, last_computed_at);

CREATE TABLE user_recommendations (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  anime_id integer NOT NULL,
  score double precision NOT NULL CHECK (score >= 0 AND score <= 1),
  reason text NOT NULL,
  source text NOT NULL,
  algorithm_version integer NOT NULL,
  updated_at bigint NOT NULL,
  PRIMARY KEY (user_id, anime_id)
);

CREATE INDEX user_recommendations_ranked
  ON user_recommendations(user_id, algorithm_version, score DESC);

CREATE INDEX history_anime_completed_user
  ON history(anime_id, completed, user_id);

CREATE INDEX collection_anime_user
  ON collection(anime_id, user_id);

INSERT INTO user_recommendation_state(user_id, dirty, dirty_at)
SELECT id, 1, created_at
FROM users
WHERE deleted_at IS NULL
ON CONFLICT (user_id) DO NOTHING;
