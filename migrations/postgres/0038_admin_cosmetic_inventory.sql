-- Explicit administrative inventory grants do not create payments, Founder
-- seats, ranking positions or achievements. Both issuer and recipient must be
-- administrators; public reward paths retain their confirmation requirements.
CREATE FUNCTION authorized_admin_cosmetic_grant(target_user_id text, grant_source text, grant_metadata jsonb)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT grant_source='admin'
    AND EXISTS(SELECT 1 FROM users WHERE id=target_user_id AND role='admin')
    AND EXISTS(SELECT 1 FROM users WHERE id=grant_metadata->>'admin_actor_id' AND role='admin');
$$;

CREATE OR REPLACE FUNCTION validate_founder_cosmetic() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item_access text;
BEGIN
  SELECT access_type INTO item_access FROM cosmetics WHERE id=NEW.cosmetic_id;
  IF item_access='founder' THEN
    IF authorized_admin_cosmetic_grant(NEW.user_id,NEW.source,NEW.metadata) THEN RETURN NEW; END IF;
    IF NEW.source<>'founder' OR NOT EXISTS (
      SELECT 1 FROM founding_members f WHERE f.user_id=NEW.user_id
    ) THEN RAISE EXCEPTION 'Founder cosmetics require membership'; END IF;
    IF NEW.cosmetic_id LIKE 'pin:founder-%' AND NOT EXISTS (
      SELECT 1 FROM founding_members f WHERE f.user_id=NEW.user_id
      AND NEW.cosmetic_id='pin:founder-' || lpad(f.founder_number::text,3,'0')
    ) THEN RAISE EXCEPTION 'Wrong Founder pin'; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION validate_fundraising_cosmetic() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM cosmetics WHERE id=NEW.cosmetic_id AND access_type='fundraising') THEN
    IF authorized_admin_cosmetic_grant(NEW.user_id,NEW.source,NEW.metadata) THEN RETURN NEW; END IF;
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
