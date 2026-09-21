INSERT INTO cosmetics(id,kind,slug,name,description,rarity,style_json,access_type,sort_order,created_at)
VALUES
  ('frame:champion-gold','frame','champion-gold','Золотая корона','Переливающаяся королевская рамка текущего лидера поддержки.','legendary','{"class":"champion-gold","animated":true}','purchase',3,0),
  ('pin:champion-crown','pin','champion-crown','Корона лидера','Эксклюзивный золотой пин текущего лидера поддержки.','legendary','{"class":"champion-crown","animated":true}','purchase',3,0)
ON CONFLICT DO NOTHING;

UPDATE cosmetics
SET description='Живой золотой тег текущего лидера поддержки AniMonster.',
    style_json='{"accent":"champion","animated":true,"shimmer":true}'::jsonb
WHERE id='tag:number-one';

INSERT INTO user_cosmetics(user_id,cosmetic_id,unlocked_at,source,source_key,metadata)
SELECT leader.user_id,reward.cosmetic_id,
       (extract(epoch FROM clock_timestamp())*1000)::bigint,
       'purchase','supporter-leader:' || reward.slug,
       jsonb_build_object('amount',leader.amount,'rank',1)
FROM (
  SELECT o.user_id,SUM(o.amount) AS amount
  FROM orders o JOIN users u ON u.id=o.user_id
  WHERE o.plan='support' AND o.status='succeeded' AND u.deleted_at IS NULL
  GROUP BY o.user_id
  ORDER BY SUM(o.amount) DESC,MIN(o.created_at),o.user_id
  LIMIT 1
) leader
CROSS JOIN (VALUES
  ('tag:number-one','number-one'),
  ('frame:champion-gold','champion-gold'),
  ('pin:champion-crown','champion-crown')
) reward(cosmetic_id,slug)
ON CONFLICT(user_id,cosmetic_id) DO UPDATE SET
  unlocked_at=excluded.unlocked_at,source=excluded.source,
  source_key=excluded.source_key,metadata=excluded.metadata;
