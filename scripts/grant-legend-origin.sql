-- Explicit owner request only: psql -v owner_id=<UUID> -v recipient_id=<UUID>.
-- Does not create orders, alter payment amounts or assign Founder/ranking seats.
BEGIN;
SELECT set_config('animonster.legend_owner', :'owner_id', true);
SELECT set_config('animonster.legend_recipient', :'recipient_id', true);
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=current_setting('animonster.legend_owner') AND role='admin' AND deleted_at IS NULL)
    THEN RAISE EXCEPTION 'Owner must be an existing administrator'; END IF;
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=current_setting('animonster.legend_recipient') AND deleted_at IS NULL AND identity NOT LIKE 'preview:%')
    THEN RAISE EXCEPTION 'Recipient must be an existing account'; END IF;
END $$;
SELECT id FROM users WHERE id IN (current_setting('animonster.legend_owner'),current_setting('animonster.legend_recipient')) ORDER BY id FOR UPDATE;
INSERT INTO user_cosmetics(user_id,cosmetic_id,unlocked_at,source,source_key,metadata)
SELECT id,'tag:legend-origin',(extract(epoch FROM clock_timestamp())*1000)::bigint,'admin','legend-origin:v1',
  jsonb_build_object('actor',current_setting('animonster.legend_owner'),'reason','Personal thanks for support at launch')
FROM users WHERE id IN (current_setting('animonster.legend_owner'),current_setting('animonster.legend_recipient'))
ON CONFLICT(user_id,cosmetic_id) DO NOTHING;
INSERT INTO grants(order_id,user_id,starts_at,expires,created_by,reason,lifetime)
SELECT 'legend-origin:v1:'||id,id,(extract(epoch FROM clock_timestamp())*1000)::bigint,0,
  current_setting('animonster.legend_owner'),'Исток легенды · пожизненный AniMonster Plus',true
FROM users WHERE id IN (current_setting('animonster.legend_owner'),current_setting('animonster.legend_recipient'))
ON CONFLICT(order_id) DO NOTHING;
UPDATE users SET tag='legend-origin',legend_origin_at=(extract(epoch FROM clock_timestamp())*1000)::bigint
WHERE id IN (current_setting('animonster.legend_owner'),current_setting('animonster.legend_recipient')) AND legend_origin_at IS NULL;
INSERT INTO moderation_actions(id,actor_id,target_user_id,action,reason,metadata,created_at)
SELECT 'legend-origin:v1:'||id,current_setting('animonster.legend_owner'),id,'legend_origin_grant',
  'Персональная благодарность за поддержку на старте','{"tag":"legend-origin","nickname":"gold-shimmer","plus":"lifetime"}',
  (extract(epoch FROM clock_timestamp())*1000)::bigint
FROM users WHERE id IN (current_setting('animonster.legend_owner'),current_setting('animonster.legend_recipient'))
ON CONFLICT(id) DO NOTHING;
COMMIT;
