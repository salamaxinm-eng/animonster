-- Every confirmed payment (monthly, annual, or custom support) contributes to
-- the lifetime supporter ranking. Preserve manual tag/frame grants, but make
-- the champion pin exclusive to the current leader.
DELETE FROM user_cosmetics
WHERE (cosmetic_id='pin:champion-crown'
    OR (cosmetic_id IN ('tag:number-one','frame:champion-gold') AND source='purchase'))
  AND user_id IS DISTINCT FROM (
    SELECT o.user_id FROM orders o JOIN users u ON u.id=o.user_id
    WHERE o.status='succeeded' AND u.deleted_at IS NULL
    GROUP BY o.user_id
    ORDER BY SUM(o.amount) DESC,MIN(o.created_at),o.user_id
    LIMIT 1
  );

UPDATE users SET
  pin=CASE WHEN pin='champion-crown' THEN NULL ELSE pin END,
  tag=CASE WHEN tag='number-one' AND NOT EXISTS (
    SELECT 1 FROM user_cosmetics WHERE user_id=users.id AND cosmetic_id='tag:number-one'
  ) THEN NULL ELSE tag END,
  profile_frame=CASE WHEN profile_frame='champion-gold' AND NOT EXISTS (
    SELECT 1 FROM user_cosmetics WHERE user_id=users.id AND cosmetic_id='frame:champion-gold'
  ) THEN 'none' ELSE profile_frame END
WHERE id IS DISTINCT FROM (
    SELECT o.user_id FROM orders o JOIN users u ON u.id=o.user_id
    WHERE o.status='succeeded' AND u.deleted_at IS NULL
    GROUP BY o.user_id
    ORDER BY SUM(o.amount) DESC,MIN(o.created_at),o.user_id
    LIMIT 1
  )
  AND (pin='champion-crown'
    OR (tag='number-one' AND NOT EXISTS (
      SELECT 1 FROM user_cosmetics WHERE user_id=users.id AND cosmetic_id='tag:number-one'))
    OR (profile_frame='champion-gold' AND NOT EXISTS (
      SELECT 1 FROM user_cosmetics WHERE user_id=users.id AND cosmetic_id='frame:champion-gold')));

UPDATE users SET pin='champion-crown'
WHERE id=(
    SELECT o.user_id FROM orders o JOIN users u ON u.id=o.user_id
    WHERE o.status='succeeded' AND u.deleted_at IS NULL
    GROUP BY o.user_id
    ORDER BY SUM(o.amount) DESC,MIN(o.created_at),o.user_id
    LIMIT 1
  )
  AND NOT EXISTS (SELECT 1 FROM user_cosmetics
    WHERE user_id=users.id AND cosmetic_id='pin:champion-crown');

INSERT INTO user_cosmetics(user_id,cosmetic_id,unlocked_at,source,source_key,metadata)
SELECT leader.user_id,reward.cosmetic_id,
       (extract(epoch FROM clock_timestamp())*1000)::bigint,
       'purchase','supporter-leader:' || reward.slug,
       jsonb_build_object('amount',leader.amount,'rank',1)
FROM (
  SELECT o.user_id,SUM(o.amount) AS amount
  FROM orders o JOIN users u ON u.id=o.user_id
  WHERE o.status='succeeded' AND u.deleted_at IS NULL
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
