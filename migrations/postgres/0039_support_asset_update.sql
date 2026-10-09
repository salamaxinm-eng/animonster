-- Replace rectangular source files with transparent cutouts; keep ownership and equipment.
UPDATE cosmetics SET image='/rewards/support/player-pin-v2.png' WHERE id='pin:player-supporter';
UPDATE cosmetics SET image='/rewards/support/development-pin-v2.png' WHERE id='pin:development-supporter';
UPDATE cosmetics SET image='/rewards/support/development-tag-v2.png',name='Oni VIP · Развитие' WHERE id='tag:support-oni-vip';
INSERT INTO cosmetics(id,kind,slug,name,description,rarity,image,access_type,sort_order,created_at)
VALUES('tag:player-supporter','tag','support-oni-player','Oni VIP · Свой плеер',
  'Розовый тег за поддержку своего плеера. Навсегда.','legendary',
  '/rewards/support/player-tag-v2.png','fundraising',91,0);
DELETE FROM fundraising_reward_items WHERE bundle_id='player_supporter_bundle' AND cosmetic_id='tag:support-oni-vip';
INSERT INTO fundraising_reward_items(bundle_id,cosmetic_id,sort_order)
VALUES('player_supporter_bundle','tag:player-supporter',20);
-- Existing successful player supporters receive their pink tag too. Do not revoke old items.
INSERT INTO user_cosmetics(user_id,cosmetic_id,unlocked_at,source,source_key,metadata)
SELECT DISTINCT ON (o.user_id) o.user_id,'tag:player-supporter',COALESCE(o.confirmed_at,o.created_at),
  'fundraising','tag:player-supporter',jsonb_build_object('order_id',o.id,'bundle_id','player_supporter_bundle','goal_id','player')
FROM orders o JOIN users u ON u.id=o.user_id
WHERE o.fundraising_goal_id='player' AND o.status='succeeded' AND NOT o.is_test AND u.identity NOT LIKE 'preview:%'
ORDER BY o.user_id,o.created_at,o.id
ON CONFLICT(user_id,cosmetic_id) DO NOTHING;
UPDATE cosmetics SET description=replace(description,'от любой суммы','') WHERE access_type='fundraising';
