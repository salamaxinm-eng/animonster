CREATE TABLE vk_bot_accounts (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  vk_user_id bigint UNIQUE CHECK(vk_user_id>0),
  link_token_hash text UNIQUE,
  link_expires_at bigint,
  linked_at bigint,
  disabled_at bigint
);
CREATE TABLE vk_bot_subscriptions (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  anime_id integer NOT NULL,
  title text NOT NULL,
  created_at bigint NOT NULL,
  PRIMARY KEY(user_id,anime_id)
);
CREATE INDEX vk_bot_subscriptions_anime ON vk_bot_subscriptions(anime_id,created_at);
CREATE TABLE vk_bot_outbox (
  id serial PRIMARY KEY,
  dedup_key text NOT NULL UNIQUE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id bigint NOT NULL CHECK(recipient_id>0),
  anime_id integer,
  episode integer,
  message text NOT NULL,
  free_at bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','sending','sent','retry','disabled')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at bigint NOT NULL,
  lease_token text,
  claimed_at bigint,
  sent_at bigint,
  last_error text,
  CHECK((anime_id IS NULL AND episode IS NULL) OR (anime_id>0 AND episode>0))
);
CREATE INDEX vk_bot_outbox_work ON vk_bot_outbox(status,next_attempt_at);
CREATE TABLE vk_bot_events (
  event_id text PRIMARY KEY,
  created_at bigint NOT NULL
);
