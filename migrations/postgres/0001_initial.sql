CREATE TABLE users (
  id text PRIMARY KEY,
  identity text NOT NULL UNIQUE,
  email text UNIQUE,
  password_hash text,
  email_verified integer NOT NULL DEFAULT 0,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user','moderator','admin')),
  nick text NOT NULL UNIQUE,
  bio text NOT NULL DEFAULT '',
  theme text NOT NULL DEFAULT 'neon',
  avatar text NOT NULL DEFAULT 'moon',
  pin text,
  wall_open integer NOT NULL DEFAULT 1,
  collection_public integer NOT NULL DEFAULT 1,
  adult_confirmed_at bigint,
  suspended_until bigint,
  created_at bigint NOT NULL,
  deleted_at bigint
);
CREATE TABLE sessions (
  hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_agent text,
  ip_hash text,
  created_at bigint NOT NULL DEFAULT 0,
  last_seen_at bigint NOT NULL DEFAULT 0,
  expires bigint NOT NULL
);
CREATE INDEX sessions_user_expires ON sessions(user_id, expires);
CREATE TABLE auth_flows (
  state text PRIMARY KEY,
  browser_hash text NOT NULL,
  verifier text NOT NULL,
  invite_hash text,
  expires bigint NOT NULL
);
CREATE TABLE auth_limits (
  key text PRIMARY KEY,
  attempts integer NOT NULL,
  expires bigint NOT NULL
);
CREATE TABLE invites (
  hash text PRIMARY KEY,
  label text NOT NULL DEFAULT '',
  created_by text NOT NULL REFERENCES users(id),
  created_at bigint NOT NULL,
  expires_at bigint,
  used_by text UNIQUE,
  used_at bigint,
  revoked_at bigint
);
CREATE TABLE email_tokens (
  hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('verify','reset')),
  expires_at bigint NOT NULL,
  used_at bigint
);
CREATE INDEX email_tokens_user_purpose ON email_tokens(user_id, purpose);
CREATE TABLE auth_identities (
  provider text NOT NULL,
  provider_user_id text NOT NULL,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at bigint NOT NULL,
  PRIMARY KEY(provider, provider_user_id),
  UNIQUE(provider, user_id)
);
CREATE TABLE collection (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  anime_id integer NOT NULL,
  title text NOT NULL,
  image text NOT NULL,
  status text NOT NULL DEFAULT 'planned',
  rating integer NOT NULL DEFAULT 0,
  favorite integer NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id, anime_id)
);
CREATE TABLE comments (
  id text PRIMARY KEY,
  scope text NOT NULL,
  author_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id text REFERENCES comments(id) ON DELETE SET NULL,
  body text NOT NULL,
  spoiler integer NOT NULL DEFAULT 0,
  pinned integer NOT NULL DEFAULT 0,
  deleted integer NOT NULL DEFAULT 0,
  created_at bigint NOT NULL,
  edited_at bigint
);
CREATE INDEX comments_scope_created ON comments(scope, created_at DESC);
CREATE INDEX comments_author_created ON comments(author_id, created_at DESC);
CREATE TABLE likes (
  value integer NOT NULL DEFAULT 1 CHECK (value IN (-1,1)),
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment_id text NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id, comment_id)
);
CREATE TABLE anime_cache (
  id integer PRIMARY KEY,
  data text NOT NULL,
  episodes text NOT NULL DEFAULT '[]',
  updated_at bigint NOT NULL
);
CREATE TABLE history (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  anime_id integer NOT NULL,
  episode integer NOT NULL,
  voiceover text NOT NULL DEFAULT 'aniliberty',
  position integer NOT NULL DEFAULT 0,
  duration integer NOT NULL,
  watched_seconds integer NOT NULL DEFAULT 0,
  completed integer NOT NULL DEFAULT 0,
  updated_at bigint NOT NULL,
  PRIMARY KEY(user_id, anime_id, episode)
);
CREATE TABLE watch_sessions (
  token text PRIMARY KEY,
  actor text NOT NULL,
  user_id text REFERENCES users(id) ON DELETE CASCADE,
  anime_id integer NOT NULL,
  episode integer NOT NULL,
  duration integer NOT NULL,
  last_at bigint NOT NULL,
  watched integer NOT NULL DEFAULT 0,
  expires bigint NOT NULL
);
CREATE TABLE daily_activity (
  day text NOT NULL,
  actor text NOT NULL,
  PRIMARY KEY(day, actor)
);
CREATE TABLE daily_views (
  day text NOT NULL,
  actor text NOT NULL,
  anime_id integer NOT NULL,
  episode integer NOT NULL,
  PRIMARY KEY(day, actor, anime_id, episode)
);
CREATE TABLE blocks (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id, target_id)
);
CREATE TABLE reports (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment_id text NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','rejected')),
  assignee_id text REFERENCES users(id),
  resolved integer NOT NULL DEFAULT 0,
  created_at bigint NOT NULL,
  resolved_at bigint,
  UNIQUE(user_id, comment_id)
);
CREATE TABLE notifications (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope text NOT NULL,
  comment_id text NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  seen integer NOT NULL DEFAULT 0,
  created_at bigint NOT NULL
);
CREATE INDEX notifications_user_created ON notifications(user_id, created_at DESC);
CREATE TABLE orders (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  provider_id text UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  created_at bigint NOT NULL
);
CREATE TABLE grants (
  order_id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starts_at bigint NOT NULL,
  expires bigint NOT NULL,
  created_by text REFERENCES users(id),
  reason text NOT NULL DEFAULT '',
  revoked_at bigint
);
CREATE INDEX grants_user_expires ON grants(user_id, expires);
CREATE TABLE moderation_actions (
  id text PRIMARY KEY,
  actor_id text NOT NULL REFERENCES users(id),
  target_user_id text REFERENCES users(id),
  report_id text REFERENCES reports(id),
  action text NOT NULL,
  reason text NOT NULL DEFAULT '',
  metadata text NOT NULL DEFAULT '{}',
  created_at bigint NOT NULL
);
CREATE INDEX moderation_actions_created ON moderation_actions(created_at DESC);
CREATE TABLE provider_health (
  provider text PRIMARY KEY,
  status text NOT NULL,
  latency_ms integer,
  error text,
  checked_at bigint NOT NULL
);
CREATE TABLE playback_events (
  id text PRIMARY KEY,
  actor text NOT NULL,
  anime_id integer NOT NULL,
  episode integer NOT NULL,
  provider text NOT NULL,
  event text NOT NULL,
  request_id text,
  created_at bigint NOT NULL
);
CREATE INDEX playback_events_created ON playback_events(created_at DESC);
