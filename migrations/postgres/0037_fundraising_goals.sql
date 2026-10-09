CREATE TABLE fundraising_reward_bundles (
  id text PRIMARY KEY,
  name text NOT NULL
);
CREATE TABLE fundraising_goals (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  short_title text NOT NULL,
  description text NOT NULL DEFAULT '',
  target_amount numeric(12,2) NOT NULL CHECK (target_amount > 0),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  reward_bundle_id text REFERENCES fundraising_reward_bundles(id)
);
CREATE TABLE fundraising_reward_items (
  bundle_id text NOT NULL REFERENCES fundraising_reward_bundles(id) ON DELETE CASCADE,
  cosmetic_id text NOT NULL REFERENCES cosmetics(id) ON DELETE RESTRICT,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY(bundle_id,cosmetic_id)
);
CREATE TABLE fundraising_reward_grants (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bundle_id text NOT NULL REFERENCES fundraising_reward_bundles(id) ON DELETE RESTRICT,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  granted_at bigint NOT NULL,
  PRIMARY KEY(user_id,bundle_id)
);

INSERT INTO fundraising_reward_bundles(id,name) VALUES
  ('player_supporter_bundle','Oni VIP · Свой плеер'),
  ('development_supporter_bundle','Oni VIP · Развитие AniMonster');
INSERT INTO fundraising_goals(id,slug,title,short_title,description,target_amount,sort_order,reward_bundle_id) VALUES
  ('player','player','Собираем на свой плеер','Свой плеер',
   'Создаём собственный плеер AniMonster. Каждая подтверждённая покупка Plus и прямая поддержка, включая прошлые платежи, приближает нас к цели.',60000,10,'player_supporter_bundle'),
  ('development','development','Развитие AniMonster','Развитие сайта',
   'Поддержка новых возможностей, стабильной работы и дальнейшего развития AniMonster.',20000,20,'development_supporter_bundle');

-- All historical orders keep their amounts and belong to the original goal.
ALTER TABLE orders ADD COLUMN fundraising_goal_id text NOT NULL DEFAULT 'player'
  REFERENCES fundraising_goals(id) ON DELETE RESTRICT;
CREATE INDEX orders_fundraising_totals ON orders(fundraising_goal_id)
  WHERE status='succeeded' AND NOT is_test;
ALTER TABLE orders DROP CONSTRAINT orders_plan_check;
ALTER TABLE orders ADD CONSTRAINT orders_plan_check CHECK (plan IN ('monthly','annual','support','donation'));
ALTER TABLE orders DROP CONSTRAINT orders_duration_days_check;
ALTER TABLE orders ADD CONSTRAINT orders_duration_days_check
  CHECK ((plan='donation' AND duration_days=0) OR (plan<>'donation' AND duration_days>0));

ALTER TABLE cosmetics DROP CONSTRAINT cosmetics_access_type_check;
ALTER TABLE cosmetics ADD CONSTRAINT cosmetics_access_type_check
  CHECK (access_type IN ('free','plus','achievement','referral','admin','purchase','founder','fundraising'));
ALTER TABLE user_cosmetics DROP CONSTRAINT user_cosmetics_source_check;
ALTER TABLE user_cosmetics ADD CONSTRAINT user_cosmetics_source_check
  CHECK (source IN ('free','plus','achievement','referral','admin','purchase','founder','fundraising'));

INSERT INTO cosmetics(id,kind,slug,name,description,rarity,image,access_type,sort_order,created_at) VALUES
  ('pin:player-supporter','pin','player-supporter','Oni · Свой плеер','За подтверждённую поддержку своего плеера от любой суммы. Навсегда.','legendary','/rewards/support/player-pin.png','fundraising',90,0),
  ('pin:development-supporter','pin','development-supporter','Oni · Развитие AniMonster','За подтверждённую поддержку развития от любой суммы. Навсегда.','legendary','/rewards/support/development-pin.png','fundraising',91,0),
  ('tag:support-oni-vip','tag','support-oni-vip','Oni VIP','Эксклюзивный тег за поддержку AniMonster. Навсегда.','legendary','/rewards/support/tag.png','fundraising',90,0),
  ('frame:support-oni','frame','support-oni','Oni · Рамка','Эксклюзивная рамка за поддержку AniMonster. Навсегда.','legendary','/rewards/support/frame.png','fundraising',90,0),
  ('background:support-oni','background','support-oni-background','Oni · Фон','Эксклюзивный фон за поддержку AniMonster. Навсегда.','legendary','/rewards/support/background.png','fundraising',90,0);
INSERT INTO fundraising_reward_items(bundle_id,cosmetic_id,sort_order)
SELECT b.id,c.id,CASE c.kind WHEN 'pin' THEN 10 WHEN 'tag' THEN 20 WHEN 'frame' THEN 30 ELSE 40 END
FROM fundraising_reward_bundles b CROSS JOIN cosmetics c
WHERE c.id IN ('tag:support-oni-vip','frame:support-oni','background:support-oni')
   OR (b.id='player_supporter_bundle' AND c.id='pin:player-supporter')
   OR (b.id='development_supporter_bundle' AND c.id='pin:development-supporter');

CREATE FUNCTION validate_fundraising_cosmetic() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM cosmetics WHERE id=NEW.cosmetic_id AND access_type='fundraising') THEN
    IF NEW.source<>'fundraising' OR NOT EXISTS (
      SELECT 1 FROM orders o JOIN fundraising_goals g ON g.id=o.fundraising_goal_id
      JOIN fundraising_reward_items i ON i.bundle_id=g.reward_bundle_id AND i.cosmetic_id=NEW.cosmetic_id
      JOIN users u ON u.id=o.user_id
      WHERE o.id=NEW.metadata->>'order_id' AND o.user_id=NEW.user_id
        AND o.status='succeeded' AND NOT o.is_test AND u.identity NOT LIKE 'preview:%'
    ) THEN RAISE EXCEPTION 'Fundraising cosmetics require a confirmed payment'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fundraising_cosmetic_guard BEFORE INSERT OR UPDATE ON user_cosmetics
FOR EACH ROW EXECUTE FUNCTION validate_fundraising_cosmetic();

-- Runs in the payment confirmation transaction. The order supplies the user;
-- a closed goal still honours payments created while it was active.
CREATE FUNCTION grant_fundraising_reward(payment_order_id text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE payment orders%ROWTYPE; bundle text; item_count integer;
BEGIN
  SELECT * INTO payment FROM orders WHERE id=payment_order_id FOR UPDATE;
  IF NOT FOUND OR payment.status<>'succeeded' OR payment.is_test THEN RETURN; END IF;
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=payment.user_id AND identity NOT LIKE 'preview:%') THEN RETURN; END IF;
  SELECT reward_bundle_id INTO bundle FROM fundraising_goals WHERE id=payment.fundraising_goal_id;
  IF bundle IS NULL THEN RETURN; END IF;
  PERFORM id FROM users WHERE id=payment.user_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM fundraising_reward_grants WHERE user_id=payment.user_id AND bundle_id=bundle) THEN RETURN; END IF;
  SELECT count(*) INTO item_count FROM fundraising_reward_items WHERE bundle_id=bundle;
  IF item_count=0 THEN RAISE EXCEPTION 'Fundraising reward bundle is empty'; END IF;
  INSERT INTO user_cosmetics(user_id,cosmetic_id,unlocked_at,source,source_key,metadata)
  SELECT payment.user_id,i.cosmetic_id,COALESCE(payment.confirmed_at,payment.created_at),'fundraising',i.cosmetic_id,
    jsonb_build_object('order_id',payment.id,'bundle_id',bundle,'goal_id',payment.fundraising_goal_id)
  FROM fundraising_reward_items i WHERE i.bundle_id=bundle
  ON CONFLICT(user_id,cosmetic_id) DO NOTHING;
  IF (SELECT count(*) FROM fundraising_reward_items i JOIN user_cosmetics uc ON uc.cosmetic_id=i.cosmetic_id
      AND uc.user_id=payment.user_id WHERE i.bundle_id=bundle) <> item_count THEN
    RAISE EXCEPTION 'Incomplete fundraising reward bundle';
  END IF;
  INSERT INTO fundraising_reward_grants(user_id,bundle_id,order_id,granted_at)
  VALUES(payment.user_id,bundle,payment.id,COALESCE(payment.confirmed_at,payment.created_at));
END $$;

-- Existing confirmed supporters receive the player bundle without changing
-- their equipped cosmetics, Plus grants, order status or fundraising totals.
SELECT grant_fundraising_reward(id) FROM orders
WHERE status='succeeded' AND NOT is_test ORDER BY created_at,id;
