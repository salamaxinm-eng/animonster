CREATE TABLE vpn_subscriptions (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  expires_at bigint NOT NULL,
  granted_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  CHECK (expires_at > granted_at)
);

CREATE TABLE vpn_allocator (
  id integer PRIMARY KEY CHECK (id = 1),
  revision bigint NOT NULL
);
INSERT INTO vpn_allocator(id, revision) VALUES (1, 0);

CREATE TABLE vpn_devices (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  slot integer NOT NULL CHECK (slot BETWEEN 3 AND 253),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','revoking','revoked','error')),
  encrypted_profile text,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  revoked_at bigint
);
CREATE INDEX vpn_devices_user_status ON vpn_devices(user_id, status);
CREATE UNIQUE INDEX vpn_devices_live_slot ON vpn_devices(slot) WHERE status <> 'revoked';

CREATE TABLE vpn_jobs (
  id text PRIMARY KEY,
  device_id text NOT NULL REFERENCES vpn_devices(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('create','revoke','renew')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','leased','done','failed')),
  attempt integer NOT NULL DEFAULT 0,
  lease_id text,
  lease_until bigint,
  next_attempt_at bigint NOT NULL,
  last_error text,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL
);
CREATE INDEX vpn_jobs_ready ON vpn_jobs(status, next_attempt_at, created_at);
CREATE UNIQUE INDEX vpn_jobs_pending_action ON vpn_jobs(device_id, action) WHERE status <> 'done';
