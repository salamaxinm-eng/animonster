-- Existing completed episodes count toward the lifetime leaderboard. Their
-- original completion date was not stored, so they do not enter the 30-day top.
CREATE TABLE qualified_episode_views (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  anime_id integer NOT NULL,
  episode integer NOT NULL,
  qualified_at bigint,
  PRIMARY KEY (user_id, anime_id, episode)
);

INSERT INTO qualified_episode_views (user_id, anime_id, episode, qualified_at)
SELECT user_id, anime_id, episode, NULL
FROM history
WHERE completed=1 OR watched_seconds>=720;

CREATE INDEX qualified_episode_views_monthly
  ON qualified_episode_views (qualified_at, user_id)
  WHERE qualified_at IS NOT NULL;
