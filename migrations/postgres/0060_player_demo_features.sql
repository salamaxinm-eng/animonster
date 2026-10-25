CREATE TABLE demo_playback_progress (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  episode integer NOT NULL CHECK (episode>0),
  position double precision NOT NULL CHECK (position>=0),
  voice text NOT NULL,
  updated_at bigint NOT NULL,
  PRIMARY KEY(user_id,episode)
);
CREATE TABLE demo_watch_rooms (
  code text PRIMARY KEY,
  host_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  episode integer NOT NULL,
  position double precision NOT NULL DEFAULT 0,
  playing boolean NOT NULL DEFAULT false,
  rate double precision NOT NULL DEFAULT 1,
  version integer NOT NULL DEFAULT 1,
  updated_at bigint NOT NULL,
  expires_at bigint NOT NULL
);
CREATE INDEX demo_watch_rooms_expiry ON demo_watch_rooms(expires_at);
CREATE TABLE demo_watch_members (
  room_code text NOT NULL REFERENCES demo_watch_rooms(code) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seen_at bigint NOT NULL,
  PRIMARY KEY(room_code,user_id)
);
