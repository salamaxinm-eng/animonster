ALTER TABLE orders
  ADD COLUMN provider text NOT NULL DEFAULT 'yookassa';

CREATE INDEX orders_provider_user_created
  ON orders(provider, user_id, created_at DESC);
