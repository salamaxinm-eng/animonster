CREATE TABLE payment_promotions (
  code text PRIMARY KEY,
  percent integer NOT NULL CHECK(percent BETWEEN 1 AND 99),
  plan text NOT NULL CHECK(plan='vpn'),
  starts_at bigint,
  expires_at bigint,
  enabled boolean NOT NULL DEFAULT false
);
INSERT INTO payment_promotions(code,percent,plan) VALUES ('animonster30',30,'vpn');
ALTER TABLE orders ADD COLUMN promo_code text REFERENCES payment_promotions(code);
ALTER TABLE orders ADD COLUMN original_amount numeric(12,2);
ALTER TABLE orders ADD COLUMN discount_amount numeric(12,2);
ALTER TABLE orders ADD COLUMN payment_url text;
CREATE TABLE payment_promo_claims (
  code text NOT NULL REFERENCES payment_promotions(code),
  user_id text NOT NULL REFERENCES users(id),
  order_id text NOT NULL UNIQUE REFERENCES orders(id),
  used_at bigint,
  PRIMARY KEY(code,user_id)
);
CREATE FUNCTION sync_payment_promo_claim() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.promo_code IS NOT NULL THEN
    IF NEW.status='succeeded' THEN
      UPDATE payment_promo_claims SET used_at=COALESCE(used_at,NEW.confirmed_at)
      WHERE order_id=NEW.id;
    ELSIF NEW.status='canceled' AND OLD.confirmed_at IS NULL THEN
      DELETE FROM payment_promo_claims WHERE order_id=NEW.id AND used_at IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER payment_promo_order_status AFTER UPDATE OF status ON orders
FOR EACH ROW EXECUTE FUNCTION sync_payment_promo_claim();
