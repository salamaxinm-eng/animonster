-- Verified achievements extend existing users/history/achievements/inventory.
ALTER TABLE achievements DROP CONSTRAINT achievements_metric_check;
ALTER TABLE achievements ADD CONSTRAINT achievements_metric_check CHECK(metric IN ('completed_episodes','anime_completed_episodes','verified_condition'));
ALTER TABLE achievements ADD COLUMN code text UNIQUE;
ALTER TABLE achievements ADD COLUMN rarity text NOT NULL DEFAULT 'common' CHECK(rarity IN ('common','rare','epic','legendary','mythic'));
ALTER TABLE achievements ADD COLUMN condition_type text;
ALTER TABLE achievements ADD COLUMN condition_config jsonb NOT NULL DEFAULT '{}';
ALTER TABLE achievements ADD COLUMN xp_reward integer NOT NULL DEFAULT 0 CHECK(xp_reward>=0);
ALTER TABLE achievements ADD COLUMN icon text NOT NULL DEFAULT 'trophy';
ALTER TABLE achievements ADD COLUMN is_secret boolean NOT NULL DEFAULT false;
ALTER TABLE achievements ADD COLUMN dataset_version text;
ALTER TABLE achievements ADD COLUMN created_at bigint NOT NULL DEFAULT 0;
ALTER TABLE achievements ADD COLUMN updated_at bigint NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN achievement_xp bigint NOT NULL DEFAULT 0 CHECK(achievement_xp>=0);
ALTER TABLE user_achievements ADD COLUMN xp_awarded integer NOT NULL DEFAULT 0 CHECK(xp_awarded>=0);
ALTER TABLE user_achievements ADD COLUMN reward_claimed boolean NOT NULL DEFAULT true;
ALTER TABLE user_achievements ADD COLUMN toast_seen_at bigint;
CREATE FUNCTION guard_verified_achievement_award() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE definition achievements%ROWTYPE;
BEGIN
  SELECT * INTO definition FROM achievements WHERE id=NEW.achievement_id;
  IF definition.metric='verified_condition' AND (
    current_setting('animonster.verified_achievement_user',true) IS DISTINCT FROM NEW.user_id
    OR NEW.xp_awarded<>definition.xp_reward OR NOT NEW.reward_claimed
  ) THEN RAISE EXCEPTION 'Verified achievement requires the confirming award transaction'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_verified_achievement_award BEFORE INSERT ON user_achievements FOR EACH ROW EXECUTE FUNCTION guard_verified_achievement_award();
CREATE INDEX user_achievements_pending_toast ON user_achievements(user_id,unlocked_at) WHERE toast_seen_at IS NULL;
CREATE TABLE achievement_catalogs(version text PRIMARY KEY,anime_id integer NOT NULL,config jsonb NOT NULL,active boolean NOT NULL DEFAULT true,created_at bigint NOT NULL);
CREATE UNIQUE INDEX achievement_catalog_active ON achievement_catalogs(anime_id) WHERE active;
CREATE TABLE anime_episode_registry(id text PRIMARY KEY,anime_id integer NOT NULL,episode_number integer NOT NULL CHECK(episode_number>0),eligible boolean NOT NULL DEFAULT true,UNIQUE(anime_id,episode_number));
ALTER TABLE history ADD COLUMN episode_id text REFERENCES anime_episode_registry(id);
ALTER TABLE history ADD COLUMN watched_intervals jsonb NOT NULL DEFAULT '[]';
ALTER TABLE history ADD COLUMN verified_duration double precision;
ALTER TABLE history ADD COLUMN verified_completed_at bigint;
ALTER TABLE history ADD COLUMN rewatch_intervals jsonb NOT NULL DEFAULT '[]';
ALTER TABLE history ADD COLUMN rewatch_count integer NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX history_stable_episode ON history(user_id,episode_id) WHERE episode_id IS NOT NULL;
CREATE INDEX history_verified_completion ON history(user_id,anime_id,verified_completed_at) WHERE verified_completed_at IS NOT NULL;
-- Event points, not duplicate progress: full rewatches need a rolling window.
CREATE TABLE episode_completion_events(
  id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  episode_id text NOT NULL REFERENCES anime_episode_registry(id),
  completion_index integer NOT NULL CHECK(completion_index>=0),completed_at bigint NOT NULL,
  watch_session text NOT NULL,UNIQUE(user_id,episode_id,completion_index)
);
CREATE INDEX episode_completion_window ON episode_completion_events(user_id,completed_at,episode_id);
ALTER TABLE watch_sessions ADD COLUMN tracking_kind text NOT NULL DEFAULT 'legacy';
ALTER TABLE watch_sessions ADD COLUMN auth_hash text;
ALTER TABLE watch_sessions ADD COLUMN seq integer NOT NULL DEFAULT 0;
ALTER TABLE watch_sessions ADD COLUMN sample_t double precision;
ALTER TABLE watch_sessions ADD COLUMN sample_p double precision;
ALTER TABLE watch_sessions ADD COLUMN sample_rate double precision;
ALTER TABLE watch_sessions ADD COLUMN created_at bigint NOT NULL DEFAULT 0;
ALTER TABLE watch_sessions ADD COLUMN timezone text;
ALTER TABLE watch_sessions ADD COLUMN episode_key text REFERENCES anime_episode_registry(id);
ALTER TABLE watch_sessions ADD COLUMN duration_basis text;
CREATE INDEX watch_sessions_verified_user ON watch_sessions(user_id,created_at) WHERE tracking_kind='verified';
ALTER TABLE pass_watch_clock ADD COLUMN achievement_credited_until bigint NOT NULL DEFAULT 0;
ALTER TABLE pass_watch_clock ADD COLUMN one_piece_state jsonb NOT NULL DEFAULT '{}';
ALTER TABLE notifications ALTER COLUMN comment_id DROP NOT NULL;
ALTER TABLE notifications ADD COLUMN achievement_id text REFERENCES achievements(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX notifications_achievement_once ON notifications(user_id,achievement_id) WHERE achievement_id IS NOT NULL;
