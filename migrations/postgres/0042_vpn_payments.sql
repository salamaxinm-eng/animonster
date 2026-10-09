ALTER TABLE orders ALTER COLUMN fundraising_goal_id DROP NOT NULL;
ALTER TABLE orders DROP CONSTRAINT orders_plan_check;
ALTER TABLE orders ADD CONSTRAINT orders_plan_check
  CHECK (plan IN ('monthly','annual','support','donation','vpn'));

CREATE TABLE vpn_entitlements (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('pilot','payment')),
  order_id text UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
  awarded_at bigint NOT NULL,
  duration_ms bigint NOT NULL CHECK (duration_ms > 0),
  revoked_at bigint,
  CHECK ((source='payment') = (order_id IS NOT NULL))
);
CREATE INDEX vpn_entitlements_user_order ON vpn_entitlements(user_id,awarded_at,id);

-- Existing pilot subscriptions remain fully accounted for when payments start.
INSERT INTO vpn_entitlements(id,user_id,source,awarded_at,duration_ms)
SELECT 'legacy:' || user_id,user_id,'pilot',granted_at,expires_at-granted_at
FROM vpn_subscriptions;
