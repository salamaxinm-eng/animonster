ALTER TABLE orders DROP CONSTRAINT orders_plan_check;
ALTER TABLE orders ADD CONSTRAINT orders_plan_check
  CHECK (plan IN ('monthly','annual','support','donation','vpn','vpn_plus'));

-- Keep the original length of each Plus grant when a bundled payment is refunded.
CREATE TABLE plus_grant_terms (
  order_id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  awarded_at bigint NOT NULL,
  duration_ms bigint NOT NULL CHECK (duration_ms > 0)
);
CREATE INDEX plus_grant_terms_user_order ON plus_grant_terms(user_id,awarded_at,order_id);
