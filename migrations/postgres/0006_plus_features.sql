ALTER TABLE users ADD COLUMN profile_background text;
ALTER TABLE users ADD COLUMN profile_frame text NOT NULL DEFAULT 'none';

ALTER TABLE collection_lists ADD COLUMN description text NOT NULL DEFAULT '';
ALTER TABLE collection_lists ADD COLUMN cover text;
ALTER TABLE collection_lists ADD COLUMN pinned integer NOT NULL DEFAULT 0;

CREATE TABLE plus_assets (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('profile_background','list_cover','character')),
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
  data bytea NOT NULL,
  updated_at bigint NOT NULL
);
CREATE INDEX plus_assets_user_kind ON plus_assets(user_id,kind);

CREATE TABLE profile_anime_showcase (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  anime_id integer NOT NULL,
  position integer NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id,anime_id)
);

CREATE TABLE characters (
  id text PRIMARY KEY,
  name text NOT NULL,
  image text NOT NULL,
  anime_id integer,
  active integer NOT NULL DEFAULT 1,
  created_at bigint NOT NULL
);
CREATE TABLE profile_character_showcase (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id text NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id,character_id)
);

CREATE TABLE comment_reactions (
  comment_id text NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction text NOT NULL CHECK (reaction IN ('fire','wow','laugh','cry','shock','heart')),
  created_at bigint NOT NULL,
  PRIMARY KEY(comment_id,user_id,reaction)
);
CREATE INDEX comment_reactions_comment ON comment_reactions(comment_id);

CREATE TABLE episode_availability (
  anime_id integer NOT NULL,
  provider text NOT NULL,
  episode integer NOT NULL,
  first_seen_at bigint NOT NULL,
  free_at bigint NOT NULL,
  PRIMARY KEY(anime_id,provider,episode)
);
CREATE INDEX episode_availability_free_at ON episode_availability(free_at);

CREATE TABLE telegram_accounts (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  telegram_id bigint UNIQUE,
  username text,
  link_token_hash text UNIQUE,
  link_expires_at bigint,
  linked_at bigint,
  disabled_at bigint
);
CREATE TABLE telegram_subscriptions (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  anime_id integer NOT NULL,
  title text NOT NULL,
  created_at bigint NOT NULL,
  PRIMARY KEY(user_id,anime_id)
);
CREATE INDEX telegram_subscriptions_anime ON telegram_subscriptions(anime_id,created_at);
CREATE TABLE telegram_deliveries (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  anime_id integer NOT NULL,
  episode integer NOT NULL,
  available_at bigint NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','retry','disabled')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at bigint NOT NULL,
  last_error text,
  sent_at bigint,
  UNIQUE(user_id,anime_id,episode)
);
CREATE INDEX telegram_deliveries_work ON telegram_deliveries(status,next_attempt_at);

CREATE TABLE editorial_collections (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  cover text,
  published integer NOT NULL DEFAULT 0,
  created_by text NOT NULL REFERENCES users(id),
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL
);
CREATE TABLE editorial_collection_items (
  collection_id text NOT NULL REFERENCES editorial_collections(id) ON DELETE CASCADE,
  anime_id integer NOT NULL,
  position integer NOT NULL,
  PRIMARY KEY(collection_id,anime_id)
);
CREATE INDEX editorial_items_position ON editorial_collection_items(collection_id,position);

CREATE TABLE plus_system_state (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at bigint NOT NULL
);
