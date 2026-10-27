INSERT INTO cosmetics(id,kind,slug,name,description,rarity,image,access_type,sort_order,created_at)
VALUES ('tag:player-catalog-patron','tag','player-catalog-patron','Меценат',
 'За подтверждённый прямой донат в новый сбор на каталог собственного плеера. Без срока действия.',
 'legendary','/rewards/player-catalog/patron-v1.png','fundraising',95,0);

CREATE OR REPLACE FUNCTION validate_fundraising_cosmetic() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.cosmetic_id='tag:player-catalog-patron' THEN
    IF NEW.source<>'fundraising' OR NOT EXISTS (
      SELECT 1 FROM orders o JOIN users u ON u.id=o.user_id CROSS JOIN player_catalog_campaign c
      WHERE c.id=1 AND o.id=NEW.metadata->>'order_id' AND o.user_id=NEW.user_id
        AND o.fundraising_goal_id='player' AND o.plan='donation' AND o.status='succeeded'
        AND NOT o.is_test AND o.confirmed_at>=c.starts_at AND u.identity NOT LIKE 'preview:%'
    ) THEN RAISE EXCEPTION 'Patron tag requires a confirmed campaign donation'; END IF;
    RETURN NEW;
  END IF;
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

CREATE FUNCTION grant_player_catalog_patron(donor text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE payment orders%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('player-catalog-patron:'||donor));
  SELECT o.* INTO payment FROM orders o JOIN users u ON u.id=o.user_id CROSS JOIN player_catalog_campaign c
    WHERE c.id=1 AND o.user_id=donor AND o.fundraising_goal_id='player' AND o.plan='donation'
      AND o.status='succeeded' AND NOT o.is_test AND o.confirmed_at>=c.starts_at
      AND u.identity NOT LIKE 'preview:%'
    ORDER BY o.confirmed_at,o.id LIMIT 1;
  IF FOUND THEN
    INSERT INTO user_cosmetics(user_id,cosmetic_id,unlocked_at,source,source_key,metadata)
    VALUES(donor,'tag:player-catalog-patron',payment.confirmed_at,'fundraising','player-catalog-donation',
      jsonb_build_object('order_id',payment.id,'campaign','player-catalog'))
    ON CONFLICT(user_id,cosmetic_id) DO UPDATE SET metadata=EXCLUDED.metadata
      WHERE user_cosmetics.metadata->>'order_id' IS DISTINCT FROM EXCLUDED.metadata->>'order_id';
  ELSE
    DELETE FROM user_cosmetics WHERE user_id=donor AND cosmetic_id='tag:player-catalog-patron' AND source='fundraising';
    UPDATE users SET tag=NULL WHERE id=donor AND tag='player-catalog-patron';
  END IF;
END $$;
CREATE FUNCTION sync_player_catalog_patron() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.plan='donation' OR (TG_OP='UPDATE' AND OLD.plan='donation') THEN
    PERFORM grant_player_catalog_patron(NEW.user_id);
    IF TG_OP='UPDATE' AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN
      PERFORM grant_player_catalog_patron(OLD.user_id);
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER player_catalog_patron_sync AFTER INSERT OR UPDATE ON orders
 FOR EACH ROW EXECUTE FUNCTION sync_player_catalog_patron();
SELECT grant_player_catalog_patron(o.user_id) FROM orders o CROSS JOIN player_catalog_campaign c
 WHERE c.id=1 AND o.plan='donation' AND o.fundraising_goal_id='player' AND o.status='succeeded'
   AND NOT o.is_test AND o.confirmed_at>=c.starts_at GROUP BY o.user_id;
