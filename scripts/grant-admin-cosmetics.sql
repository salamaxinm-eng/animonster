-- Explicit owner/admin request only. Run with psql -v user_id=<admin UUID>.
-- Does not fabricate payments, membership, achievements or ranking positions.
BEGIN;
SELECT set_config('animonster.admin_cosmetic_recipient', :'user_id', true);
DO $$
DECLARE recipient text := current_setting('animonster.admin_cosmetic_recipient');
BEGIN
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=recipient AND role='admin' AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Recipient must be an existing administrator';
  END IF;
END $$;
INSERT INTO user_cosmetics(user_id,cosmetic_id,unlocked_at,source,source_key,metadata)
SELECT current_setting('animonster.admin_cosmetic_recipient'),c.id,
       (extract(epoch FROM clock_timestamp())*1000)::bigint,'admin','admin-all:' || c.id,
       jsonb_build_object('admin_actor_id',current_setting('animonster.admin_cosmetic_recipient'),
                          'reason','Explicit owner request: complete cosmetic inventory')
FROM cosmetics c WHERE c.active=1
ON CONFLICT(user_id,cosmetic_id) DO NOTHING;
INSERT INTO moderation_actions(id,actor_id,target_user_id,action,reason,metadata,created_at)
VALUES(gen_random_uuid()::text,current_setting('animonster.admin_cosmetic_recipient'),
       current_setting('animonster.admin_cosmetic_recipient'),'cosmetics_grant_all',
       'Explicit owner request: complete cosmetic inventory',
       jsonb_build_object('active_catalog_count',(SELECT count(*) FROM cosmetics WHERE active=1),
                          'equipped_changed',false)::text,
       (extract(epoch FROM clock_timestamp())*1000)::bigint);
COMMIT;
