ALTER TABLE orders ADD COLUMN plan text NOT NULL DEFAULT 'monthly' CHECK (plan IN ('monthly','annual'));
ALTER TABLE orders ADD COLUMN amount numeric(10,2) NOT NULL DEFAULT 89.00 CHECK (amount > 0);
ALTER TABLE orders ADD COLUMN duration_days integer NOT NULL DEFAULT 30 CHECK (duration_days > 0);
ALTER TABLE cosmetics DROP CONSTRAINT cosmetics_access_type_check;
ALTER TABLE cosmetics ADD CONSTRAINT cosmetics_access_type_check CHECK (access_type IN ('free','plus','achievement','referral','admin','purchase'));
ALTER TABLE user_cosmetics DROP CONSTRAINT user_cosmetics_source_check;
ALTER TABLE user_cosmetics ADD CONSTRAINT user_cosmetics_source_check CHECK (source IN ('free','plus','achievement','referral','admin','purchase'));
INSERT INTO cosmetics(id,kind,slug,name,description,rarity,style_json,access_type,sort_order,created_at)
VALUES ('tag:eternal-nakama','tag','eternal-nakama','Вечный накама','Эксклюзивный постоянный тег за подтверждённую покупку годового AniMonster Plus.','legendary','{"accent":"celestial","animated":true}','purchase',5,0);
