CREATE TABLE qr_login_requests (
 id text PRIMARY KEY,
 scan_hash text NOT NULL,
 browser_hash text NOT NULL,
 device text NOT NULL,
 user_agent text NOT NULL,
 ip_hash text NOT NULL,
 verification_code text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','denied','consumed')),
 user_id text REFERENCES users(id) ON DELETE CASCADE,
 source_session_hash text REFERENCES sessions(hash) ON DELETE SET NULL,
 created_at bigint NOT NULL,
 expires_at bigint NOT NULL,
 consumed_at bigint
);
CREATE INDEX qr_login_expiry ON qr_login_requests(expires_at);
