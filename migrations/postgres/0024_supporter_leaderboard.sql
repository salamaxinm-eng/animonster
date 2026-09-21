ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_plan_check;
ALTER TABLE orders ADD CONSTRAINT orders_plan_check CHECK (plan IN ('monthly','annual','support'));

CREATE INDEX orders_supporter_leaderboard
  ON orders(plan,status,user_id,created_at)
  WHERE plan='support' AND status='succeeded';

INSERT INTO cosmetics(id,kind,slug,name,description,rarity,style_json,access_type,sort_order,created_at)
VALUES (
  'tag:number-one',
  'tag',
  'number-one',
  'Номер 1',
  'Переходящий тег главного участника рейтинга поддержки AniMonster.',
  'legendary',
  '{"accent":"champion","animated":true}',
  'purchase',
  4,
  0
) ON CONFLICT DO NOTHING;
