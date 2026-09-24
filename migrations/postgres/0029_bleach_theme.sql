-- A permanent site theme for viewers who complete 100 Bleach episodes.
ALTER TABLE cosmetics DROP CONSTRAINT IF EXISTS cosmetics_kind_check;
ALTER TABLE cosmetics
  ADD CONSTRAINT cosmetics_kind_check CHECK (kind IN ('tag','pin','frame','theme'));

INSERT INTO achievements(id,slug,name,description,category,metric,threshold,anime_id,sort_order)
VALUES ('achievement:bleach-theme-100','bleach-theme-100','Сотня синигами','Посмотри 100 серий «Блич»','anime','anime_completed_episodes',100,269,111)
ON CONFLICT DO NOTHING;

INSERT INTO cosmetics(id,kind,slug,name,description,rarity,image,access_type,sort_order,created_at)
VALUES ('theme:bleach','theme','bleach-theme','Тема «Блич»','Красная тема AniMonster с маской синигами. Открывается навсегда за 100 серий «Блич».','legendary','/themes/bleach-mask.svg','achievement',400,0)
ON CONFLICT DO NOTHING;

INSERT INTO achievement_rewards(achievement_id,cosmetic_id)
VALUES ('achievement:bleach-theme-100','theme:bleach')
ON CONFLICT DO NOTHING;

-- Grant the achievement and theme to viewers who reached the milestone before this migration.
INSERT INTO user_achievements(user_id,achievement_id,unlocked_at)
SELECT user_id,'achievement:bleach-theme-100',(extract(epoch FROM clock_timestamp())*1000)::bigint
FROM history
WHERE anime_id=269
GROUP BY user_id
HAVING COALESCE(sum(completed),0)>=100
ON CONFLICT DO NOTHING;

INSERT INTO user_cosmetics(user_id,cosmetic_id,unlocked_at,source,source_key,metadata)
SELECT ua.user_id,'theme:bleach',ua.unlocked_at,'achievement',
  'achievement:bleach-theme-100:bleach-theme',jsonb_build_object('achievement','bleach-theme-100')
FROM user_achievements ua
WHERE ua.achievement_id='achievement:bleach-theme-100'
ON CONFLICT DO NOTHING;
