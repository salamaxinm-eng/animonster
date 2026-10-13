-- Hand-composed final set from the four real frames and vector typography. See public/rewards/pass/SOURCES.md.
UPDATE cosmetics SET name='Пробуждение Oni · пин',image='/rewards/pass/oni-final-pin.png',rarity='legendary' WHERE id='pin:pass-oni' AND access_type='battlepass';
INSERT INTO pass_rewards(season_id,level,track,cosmetic_id,name,preview,kind) VALUES ('oni-awakening',40,'premium','pin:pass-oni','Пробуждение Oni · пин','/rewards/pass/oni-final-pin.png','pin');
UPDATE cosmetics SET name='ONI AWAKENED',image='/rewards/pass/oni-final-tag.png',rarity='legendary' WHERE id='tag:pass-oni' AND access_type='battlepass';
INSERT INTO pass_rewards(season_id,level,track,cosmetic_id,name,preview,kind) VALUES ('oni-awakening',40,'premium','tag:pass-oni','ONI AWAKENED','/rewards/pass/oni-final-tag.png','tag');
UPDATE cosmetics SET name='Пробуждение Oni · рамка',image='/rewards/pass/oni-final-frame.png',rarity='legendary' WHERE id='frame:pass-oni' AND access_type='battlepass';
INSERT INTO pass_rewards(season_id,level,track,cosmetic_id,name,preview,kind) VALUES ('oni-awakening',40,'premium','frame:pass-oni','Пробуждение Oni · рамка','/rewards/pass/oni-final-frame.png','frame');
UPDATE cosmetics SET name='Пробуждение Oni · фон',image='/rewards/pass/oni-final-background.png',rarity='legendary' WHERE id='background:pass-oni' AND access_type='battlepass';
INSERT INTO pass_rewards(season_id,level,track,cosmetic_id,name,preview,kind) VALUES ('oni-awakening',40,'premium','background:pass-oni','Пробуждение Oni · фон','/rewards/pass/oni-final-background.png','background');
INSERT INTO cosmetics(id,kind,slug,name,description,rarity,image,access_type,created_at) VALUES ('tag:pass-four-worlds','tag','pass-four-worlds-tag','FOUR WORLDS','Отсылка к четырём историям сезона: накама, банкай, Чёрные быки и воля огня','epic','/rewards/pass/four-worlds-tag.png','battlepass',0);
INSERT INTO pass_rewards(season_id,level,track,cosmetic_id,name,preview,kind) VALUES ('oni-awakening',40,'free','tag:pass-four-worlds','FOUR WORLDS','/rewards/pass/four-worlds-tag.png','tag');
