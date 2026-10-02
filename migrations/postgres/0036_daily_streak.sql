ALTER TABLE users
  ADD COLUMN current_streak integer NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  ADD COLUMN longest_streak integer NOT NULL DEFAULT 0 CHECK (longest_streak >= 0),
  ADD COLUMN last_streak_date text;

CREATE TABLE streak_episode_days (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day text NOT NULL,
  anime_id integer NOT NULL,
  episode integer NOT NULL,
  watched_seconds integer NOT NULL DEFAULT 0 CHECK (watched_seconds >= 0),
  PRIMARY KEY (user_id, day, anime_id, episode)
);
