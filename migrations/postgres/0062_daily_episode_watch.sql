-- New precise daily counters start at deployment; historical 30-second views remain intact.
CREATE TABLE daily_episode_watch (
  day text NOT NULL,
  actor text NOT NULL,
  anime_id integer NOT NULL,
  episode integer NOT NULL,
  seconds integer NOT NULL CHECK (seconds >= 0),
  last_at bigint NOT NULL,
  PRIMARY KEY(day, actor, anime_id, episode)
);
