ALTER TABLE cosmetics DROP CONSTRAINT cosmetics_access_type_check;
ALTER TABLE cosmetics ADD CONSTRAINT cosmetics_access_type_check CHECK (access_type IN ('free','plus','achievement','referral','admin','purchase','founder','fundraising','battlepass'));
ALTER TABLE user_cosmetics DROP CONSTRAINT user_cosmetics_source_check;
ALTER TABLE user_cosmetics ADD CONSTRAINT user_cosmetics_source_check CHECK (source IN ('free','plus','achievement','referral','admin','purchase','founder','fundraising','battlepass'));
ALTER TABLE orders DROP CONSTRAINT orders_plan_check;
ALTER TABLE orders ADD CONSTRAINT orders_plan_check CHECK (plan IN ('monthly','annual','support','donation','vpn','vpn_plus','battlepass'));

CREATE TABLE pass_seasons (
 id text PRIMARY KEY, title text NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
 timezone text NOT NULL DEFAULT 'Europe/Moscow', starts_at bigint, ends_at bigint,
 price integer NOT NULL DEFAULT 1499 CHECK (price BETWEEN 1 AND 100000),
 tasks jsonb NOT NULL DEFAULT '{}'::jsonb, genres jsonb NOT NULL DEFAULT '[]'::jsonb,
 published_at bigint, created_at bigint NOT NULL, finalized_at bigint,
 CHECK (ends_at IS NULL OR ends_at > starts_at)
);
CREATE TABLE pass_assets (
 id text PRIMARY KEY, mime text NOT NULL, data bytea NOT NULL, width integer NOT NULL, height integer NOT NULL,
 sha256 text NOT NULL, source_note text NOT NULL, created_at bigint NOT NULL
);
CREATE TABLE pass_rewards (
 season_id text NOT NULL REFERENCES pass_seasons(id), level integer NOT NULL CHECK (level BETWEEN 1 AND 40),
 track text NOT NULL CHECK (track IN ('free','premium')), cosmetic_id text NOT NULL REFERENCES cosmetics(id),
 name text NOT NULL, preview text NOT NULL, kind text NOT NULL CHECK (kind IN ('pin','tag','frame','background')),
 PRIMARY KEY (season_id,level,track,cosmetic_id)
);
CREATE FUNCTION pass_guard_asset() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'Pass assets are immutable; upload a new asset instead'; END $$;
CREATE TRIGGER pass_immutable_assets BEFORE UPDATE OR DELETE ON pass_assets FOR EACH ROW EXECUTE FUNCTION pass_guard_asset();
CREATE TABLE pass_members (
 season_id text NOT NULL REFERENCES pass_seasons(id), user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 xp integer NOT NULL DEFAULT 0 CHECK (xp >= 0), premium boolean NOT NULL DEFAULT false, joined_at bigint NOT NULL, settled_at bigint,
 PRIMARY KEY(season_id,user_id)
);
CREATE INDEX pass_members_settlement ON pass_members(season_id,user_id) WHERE settled_at IS NULL;
CREATE TABLE pass_xp (
 season_id text NOT NULL, user_id text NOT NULL, key text NOT NULL, amount integer NOT NULL, reason text NOT NULL,
 created_at bigint NOT NULL, PRIMARY KEY(season_id,user_id,key),
 FOREIGN KEY(season_id,user_id) REFERENCES pass_members(season_id,user_id) ON DELETE CASCADE
);
CREATE TABLE pass_scopes (
 season_id text NOT NULL, user_id text NOT NULL, scope text NOT NULL,
 stats jsonb NOT NULL DEFAULT '{"seconds":0,"days":{},"titles":{},"episodes":0}'::jsonb,
 genre text, rerolled boolean NOT NULL DEFAULT false, genre_since bigint NOT NULL,
 PRIMARY KEY(season_id,user_id,scope), FOREIGN KEY(season_id,user_id) REFERENCES pass_members(season_id,user_id) ON DELETE CASCADE
);
CREATE TABLE pass_coverage (
 season_id text NOT NULL, user_id text NOT NULL, scope text NOT NULL, anime_id bigint NOT NULL, episode integer NOT NULL,
 ranges jsonb NOT NULL DEFAULT '[]'::jsonb, completed boolean NOT NULL DEFAULT false,
 PRIMARY KEY(season_id,user_id,scope,anime_id,episode),
 FOREIGN KEY(season_id,user_id,scope) REFERENCES pass_scopes(season_id,user_id,scope) ON DELETE CASCADE
);
CREATE TABLE pass_watch_clock (
 user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, credited_until bigint NOT NULL DEFAULT 0
);
CREATE TABLE pass_watch_sessions (
 id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, auth_hash text NOT NULL,
 season_id text NOT NULL REFERENCES pass_seasons(id), anime_id bigint NOT NULL, episode integer NOT NULL,
 duration double precision, genres jsonb NOT NULL, created_at bigint NOT NULL, expires_at bigint NOT NULL,
 seq integer NOT NULL DEFAULT 0, last_t double precision, last_p double precision
);
CREATE INDEX pass_watch_session_expiry ON pass_watch_sessions(expires_at);
CREATE INDEX pass_watch_session_user ON pass_watch_sessions(user_id,created_at);
CREATE TABLE pass_claims (
 season_id text NOT NULL, user_id text NOT NULL, level integer NOT NULL, track text NOT NULL, cosmetic_id text NOT NULL,
 claimed_at bigint NOT NULL, PRIMARY KEY(season_id,user_id,level,track,cosmetic_id),
 FOREIGN KEY(season_id,user_id) REFERENCES pass_members(season_id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(season_id,level,track,cosmetic_id) REFERENCES pass_rewards(season_id,level,track,cosmetic_id)
);
ALTER TABLE orders ADD COLUMN pass_season_id text REFERENCES pass_seasons(id);
CREATE TABLE pass_purchases (
 season_id text NOT NULL REFERENCES pass_seasons(id), user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 order_id text NOT NULL UNIQUE REFERENCES orders(id), state text NOT NULL CHECK(state IN ('pending','active','canceled','chargebacked','review')),
 payment_url text, created_at bigint NOT NULL, PRIMARY KEY(season_id,user_id)
);
CREATE TABLE pass_audit (
 id text PRIMARY KEY, actor_id text NOT NULL REFERENCES users(id), season_id text REFERENCES pass_seasons(id),
 target_user_id text REFERENCES users(id), action text NOT NULL, reason text NOT NULL, detail jsonb NOT NULL, created_at bigint NOT NULL
);
-- The product snapshot cannot silently change after publication, even via SQL.
CREATE FUNCTION pass_guard_season() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status='published' AND (TG_OP='DELETE' OR (to_jsonb(NEW)-'finalized_at') IS DISTINCT FROM (to_jsonb(OLD)-'finalized_at')) THEN
  RAISE EXCEPTION 'Published pass seasons are immutable';
 END IF; RETURN COALESCE(NEW,OLD); END $$;
CREATE TRIGGER pass_frozen_season BEFORE UPDATE OR DELETE ON pass_seasons FOR EACH ROW EXECUTE FUNCTION pass_guard_season();
CREATE FUNCTION pass_guard_reward() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM pass_seasons WHERE (id=NEW.season_id OR id=OLD.season_id) AND status='published') THEN
  RAISE EXCEPTION 'Published pass rewards are immutable';
 END IF; RETURN COALESCE(NEW,OLD); END $$;
CREATE TRIGGER pass_frozen_rewards BEFORE INSERT OR UPDATE OR DELETE ON pass_rewards FOR EACH ROW EXECUTE FUNCTION pass_guard_reward();
CREATE FUNCTION pass_guard_cosmetic() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM pass_rewards r JOIN pass_seasons s ON s.id=r.season_id WHERE r.cosmetic_id=OLD.id AND s.status='published') THEN
  RAISE EXCEPTION 'A published pass owns an immutable copy of this cosmetic';
 END IF; RETURN COALESCE(NEW,OLD); END $$;
CREATE TRIGGER pass_frozen_cosmetics BEFORE UPDATE OR DELETE ON cosmetics FOR EACH ROW EXECUTE FUNCTION pass_guard_cosmetic();

INSERT INTO pass_seasons(id,title,created_at) VALUES ('oni-awakening','Пробуждение Oni',0);
-- Final bundle placeholders are deliberately not reward rows: publishing stays blocked until all four supplied assets are attached.
INSERT INTO cosmetics(id,kind,slug,name,description,rarity,access_type,created_at) VALUES
 ('pin:pass-oni','pin','pass-oni','Пробуждение Oni · пин','Финальный комплект 40-го уровня AniMonster Pass','legendary','battlepass',0),
 ('tag:pass-oni','tag','pass-oni-tag','ONI AWAKENED','Финальный комплект 40-го уровня AniMonster Pass','legendary','battlepass',0),
 ('frame:pass-oni','frame','pass-oni-frame','Пробуждение Oni · рамка','Финальный комплект 40-го уровня AniMonster Pass','legendary','battlepass',0),
 ('background:pass-oni','background','pass-oni-background','Пробуждение Oni · фон','Финальный комплект 40-го уровня AniMonster Pass','legendary','battlepass',0);

ALTER TABLE orders DROP CONSTRAINT orders_duration_days_check;
ALTER TABLE orders ADD CONSTRAINT orders_duration_days_check CHECK ((plan IN ('donation','battlepass') AND duration_days=0) OR (plan NOT IN ('donation','battlepass') AND duration_days>0));
