-- Founder seats are permanent. The counter is deliberately separate from the
-- members table so simultaneous confirmations cannot select the same seat.
ALTER TABLE orders ADD COLUMN confirmed_at bigint;
ALTER TABLE orders ADD COLUMN is_test boolean NOT NULL DEFAULT false;
ALTER TABLE grants ADD COLUMN lifetime boolean NOT NULL DEFAULT false;

CREATE TABLE founding_sequence (
  id integer PRIMARY KEY CHECK (id=1),
  next_number integer NOT NULL CHECK (next_number BETWEEN 1 AND 11),
  backfilled boolean NOT NULL DEFAULT false
);
INSERT INTO founding_sequence(id,next_number,backfilled)
SELECT 1,1,NOT EXISTS (
  SELECT 1 FROM orders o JOIN users u ON u.id=o.user_id
  WHERE o.status='succeeded' AND o.amount>=1000 AND NOT o.is_test
    AND u.identity NOT LIKE 'preview:%' AND u.identity NOT LIKE 'test:%'
);

CREATE TABLE founding_members (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  founder_number integer NOT NULL UNIQUE CHECK (founder_number BETWEEN 1 AND 10),
  payment_id text NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
  qualifying_amount numeric(10,2) NOT NULL CHECK (qualifying_amount >= 1000),
  currency text NOT NULL DEFAULT 'RUB' CHECK (currency='RUB'),
  first_qualifying_payment_at bigint NOT NULL,
  created_at bigint NOT NULL
);

ALTER TABLE cosmetics DROP CONSTRAINT cosmetics_kind_check;
ALTER TABLE cosmetics ADD CONSTRAINT cosmetics_kind_check CHECK (kind IN ('tag','pin','frame','theme','background'));
ALTER TABLE cosmetics DROP CONSTRAINT cosmetics_access_type_check;
ALTER TABLE cosmetics ADD CONSTRAINT cosmetics_access_type_check CHECK (access_type IN ('free','plus','achievement','referral','admin','purchase','founder'));
ALTER TABLE user_cosmetics DROP CONSTRAINT user_cosmetics_source_check;
ALTER TABLE user_cosmetics ADD CONSTRAINT user_cosmetics_source_check CHECK (source IN ('free','plus','achievement','referral','admin','purchase','founder'));

INSERT INTO cosmetics(id,kind,slug,name,description,rarity,image,access_type,sort_order,created_at) VALUES
  ('tag:founding-10','tag','founding-10','FOUNDING 10','Один из первых 10 пользователей, поддержавших AniMonster донатом от 1000 ₽.','legendary',NULL,'founder',1,0),
  ('frame:founder','frame','founder','Founder Frame','Эксклюзивная рамка Founder.','legendary','/frames/founder.svg','founder',1,0),
  ('background:founder','background','founder-background','Founder Background','Эксклюзивный фон Founder.','legendary','/rewards/founder/background.svg','founder',1,0)
ON CONFLICT(id) DO NOTHING;

INSERT INTO cosmetics(id,kind,slug,name,description,rarity,image,access_type,sort_order,created_at)
SELECT 'pin:founder-' || lpad(n::text,3,'0'),'pin','founder-' || lpad(n::text,3,'0'),
       'Founder #' || lpad(n::text,3,'0'),'Один из первых 10 пользователей, поддержавших AniMonster донатом от 1000 ₽.',
       'legendary','/rewards/founder/founder-' || lpad(n::text,3,'0') || '.svg','founder',n,0
FROM generate_series(1,10) n ON CONFLICT(id) DO NOTHING;

-- Existing rewards APIs must not be able to grant Founder items, even if a
-- future application path mistakenly calls their generic insert helper.
CREATE FUNCTION validate_founder_cosmetic() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item_access text;
BEGIN
  SELECT access_type INTO item_access FROM cosmetics WHERE id=NEW.cosmetic_id;
  IF item_access='founder' THEN
    IF NEW.source<>'founder' OR NOT EXISTS (
      SELECT 1 FROM founding_members f WHERE f.user_id=NEW.user_id
    ) THEN
      RAISE EXCEPTION 'Founder cosmetics require membership';
    END IF;
    IF NEW.cosmetic_id LIKE 'pin:founder-%' AND NOT EXISTS (
      SELECT 1 FROM founding_members f WHERE f.user_id=NEW.user_id
      AND NEW.cosmetic_id='pin:founder-' || lpad(f.founder_number::text,3,'0')
    ) THEN RAISE EXCEPTION 'Wrong Founder pin'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER founder_cosmetic_guard BEFORE INSERT OR UPDATE ON user_cosmetics
FOR EACH ROW EXECUTE FUNCTION validate_founder_cosmetic();
