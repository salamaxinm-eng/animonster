\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE job admin_watch_simulations%ROWTYPE; stamp bigint;
  previous_episode integer; next_episode integer; episode_duration integer;
  inserted_count integer; previous_voiceover text;
BEGIN
  stamp := (extract(epoch FROM clock_timestamp())*1000)::bigint;
  FOR job IN SELECT * FROM admin_watch_simulations WHERE enabled AND next_run_at<=stamp FOR UPDATE SKIP LOCKED LOOP
    IF NOT EXISTS(SELECT 1 FROM users WHERE id=job.actor_id AND role='admin' AND deleted_at IS NULL)
      OR NOT EXISTS(SELECT 1 FROM users WHERE id=job.user_id AND deleted_at IS NULL) THEN
      UPDATE admin_watch_simulations SET enabled=false WHERE id=job.id;
      CONTINUE;
    END IF;
    SELECT GREATEST(
      COALESCE((SELECT max(episode) FROM qualified_episode_views WHERE user_id=job.user_id AND anime_id=job.anime_id),0),
      COALESCE((SELECT max(episode) FROM history WHERE user_id=job.user_id AND anime_id=job.anime_id AND completed=1),0)
    ) INTO previous_episode;
    next_episode := NULL;
    SELECT (e->>'ordinal')::integer,GREATEST(720,COALESCE((e->>'duration')::integer,1440))
      INTO next_episode,episode_duration FROM anime_cache a CROSS JOIN LATERAL jsonb_array_elements(a.episodes::jsonb) e
      WHERE a.id=job.anime_id AND (e->>'ordinal')::integer>previous_episode
      ORDER BY (e->>'ordinal')::integer LIMIT 1;
    IF next_episode IS NULL THEN CONTINUE; END IF;
    INSERT INTO qualified_episode_views(user_id,anime_id,episode,qualified_at)
      VALUES(job.user_id,job.anime_id,next_episode,stamp) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS inserted_count = ROW_COUNT;
    IF inserted_count=1 THEN
      SELECT voiceover INTO previous_voiceover FROM history WHERE user_id=job.user_id AND anime_id=job.anime_id ORDER BY episode DESC LIMIT 1;
      INSERT INTO history(user_id,anime_id,episode,voiceover,position,duration,watched_seconds,completed,updated_at)
        VALUES(job.user_id,job.anime_id,next_episode,COALESCE(previous_voiceover,'admin-simulation'),episode_duration,episode_duration,episode_duration,1,stamp)
        ON CONFLICT(user_id,anime_id,episode) DO UPDATE SET position=history.duration,
          watched_seconds=history.duration,completed=1,updated_at=excluded.updated_at;
      INSERT INTO admin_watch_simulation_events(job_id,episode,added_at) VALUES(job.id,next_episode,stamp);
      INSERT INTO user_recommendation_state(user_id,dirty,dirty_at) VALUES(job.user_id,1,stamp)
        ON CONFLICT(user_id) DO UPDATE SET dirty=1,dirty_at=excluded.dirty_at;
      RAISE NOTICE 'Administrative simulation: user %, anime %, episode %',job.user_id,job.anime_id,next_episode;
    END IF;
    UPDATE admin_watch_simulations SET next_run_at=stamp+job.interval_ms WHERE id=job.id;
  END LOOP;
END $$;
COMMIT;
