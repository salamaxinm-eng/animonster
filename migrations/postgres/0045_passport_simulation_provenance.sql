-- Keep provenance after a simulation job is removed.
CREATE TABLE passport_simulated_episodes (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  anime_id integer NOT NULL,
  episode integer NOT NULL,
  added_at bigint NOT NULL,
  PRIMARY KEY(user_id,anime_id,episode)
);
INSERT INTO passport_simulated_episodes(user_id,anime_id,episode,added_at)
SELECT j.user_id,j.anime_id,e.episode,e.added_at
FROM admin_watch_simulation_events e JOIN admin_watch_simulations j ON j.id=e.job_id
ON CONFLICT DO NOTHING;

CREATE FUNCTION record_passport_simulated_episode() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO passport_simulated_episodes(user_id,anime_id,episode,added_at)
  SELECT j.user_id,j.anime_id,NEW.episode,NEW.added_at
  FROM admin_watch_simulations j WHERE j.id=NEW.job_id
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER passport_simulated_episode_insert
AFTER INSERT ON admin_watch_simulation_events
FOR EACH ROW EXECUTE FUNCTION record_passport_simulated_episode();
