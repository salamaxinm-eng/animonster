CREATE TABLE watch_parties (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  host_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  anime_id integer NOT NULL,
  anime_title text NOT NULL,
  release_id integer,
  episode integer NOT NULL,
  provider text NOT NULL CHECK (provider IN ('aniliberty','kodik')),
  voiceover text NOT NULL,
  position_ms integer NOT NULL DEFAULT 0,
  playing integer NOT NULL DEFAULT 0,
  state_version integer NOT NULL DEFAULT 1,
  state_updated_at bigint NOT NULL,
  host_missing_since bigint,
  next_episode integer,
  next_episode_at bigint,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  created_at bigint NOT NULL,
  expires_at bigint NOT NULL,
  empty_since bigint,
  ended_at bigint
);
CREATE INDEX watch_parties_status_expiry ON watch_parties(status,expires_at);
CREATE INDEX watch_parties_host_status ON watch_parties(host_user_id,status);

CREATE TABLE watch_party_members (
  party_id text NOT NULL REFERENCES watch_parties(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('host','member')),
  joined_at bigint NOT NULL,
  last_seen_at bigint NOT NULL,
  left_at bigint,
  chat_muted integer NOT NULL DEFAULT 0,
  kicked_at bigint,
  PRIMARY KEY(party_id,user_id)
);
CREATE INDEX watch_party_members_presence ON watch_party_members(party_id,last_seen_at)
  WHERE left_at IS NULL AND kicked_at IS NULL;
CREATE INDEX watch_party_members_user ON watch_party_members(user_id,last_seen_at DESC);

CREATE TABLE watch_party_active_users (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  party_id text NOT NULL REFERENCES watch_parties(id) ON DELETE CASCADE,
  updated_at bigint NOT NULL
);

CREATE TABLE watch_party_events (
  id bigserial PRIMARY KEY,
  party_id text NOT NULL REFERENCES watch_parties(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload text NOT NULL DEFAULT '{}',
  actor_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at bigint NOT NULL
);
CREATE INDEX watch_party_events_stream ON watch_party_events(party_id,id);

CREATE TABLE watch_party_messages (
  id text PRIMARY KEY,
  party_id text NOT NULL REFERENCES watch_parties(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at bigint NOT NULL,
  deleted_at bigint
);
CREATE INDEX watch_party_messages_party_created ON watch_party_messages(party_id,created_at);

CREATE TABLE watch_party_bans (
  party_id text NOT NULL REFERENCES watch_parties(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at bigint NOT NULL,
  PRIMARY KEY(party_id,user_id)
);

CREATE TABLE watch_party_reports (
  id text PRIMARY KEY,
  party_id text NOT NULL REFERENCES watch_parties(id) ON DELETE CASCADE,
  message_id text REFERENCES watch_party_messages(id) ON DELETE SET NULL,
  reporter_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','rejected')),
  created_at bigint NOT NULL,
  resolved_at bigint,
  UNIQUE(reporter_id,message_id)
);
CREATE INDEX watch_party_reports_status ON watch_party_reports(status,created_at DESC);

CREATE TABLE watch_party_weekly_quotas (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start text NOT NULL,
  used integer NOT NULL DEFAULT 0 CHECK (used BETWEEN 0 AND 10),
  updated_at bigint NOT NULL,
  PRIMARY KEY(user_id,week_start)
);

CREATE TABLE watch_party_episode_usage (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start text NOT NULL,
  anime_id integer NOT NULL,
  episode integer NOT NULL,
  watched_seconds integer NOT NULL DEFAULT 0,
  charged_at bigint,
  updated_at bigint NOT NULL,
  PRIMARY KEY(user_id,week_start,anime_id,episode)
);
CREATE INDEX watch_party_usage_charged ON watch_party_episode_usage(user_id,week_start,charged_at);
