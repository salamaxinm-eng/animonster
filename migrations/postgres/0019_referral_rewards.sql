INSERT INTO cosmetics(id,kind,slug,name,description,rarity,image,style_json,access_type,sort_order,created_at) VALUES
  ('tag:recruiter','tag','recruiter','Вербовщик','За одного квалифицированного друга','rare',NULL,'{"accent":"lime"}','referral',200,0),
  ('pin:referral-scout','pin','referral-scout','Искатель','Только за реферальную программу','rare','/pins/referral-scout.svg',NULL,'referral',210,0),
  ('pin:referral-crew','pin','referral-crew','Команда','Только за реферальную программу','epic','/pins/referral-crew.svg',NULL,'referral',220,0),
  ('frame:referral-master','frame','referral-master','Мастер приглашений','За десять квалифицированных друзей','legendary',NULL,'{"class":"referral-master"}','referral',230,0),
  ('pin:referral-master','pin','referral-master-pin','Капитан','Только за реферальную программу','epic','/pins/referral-master.svg',NULL,'referral',230,0),
  ('pin:referral-legend','pin','referral-legend','Легендарный проводник','Только за реферальную программу','legendary','/pins/referral-legend.svg',NULL,'referral',240,0)
ON CONFLICT(slug) DO NOTHING;
