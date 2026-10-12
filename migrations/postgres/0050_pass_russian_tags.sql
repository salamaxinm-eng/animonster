-- Replace draft-season tag artwork and inventory labels with Russian text.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pass_seasons WHERE id='oni-awakening' AND status<>'draft') THEN
    RAISE EXCEPTION 'Russian tag migration requires the Oni season to remain a draft';
  END IF;
END $$;

UPDATE cosmetics AS c SET name=t.name,image=t.image
FROM (VALUES
  ('tag:pass-one-piece','НАКАМА НАВСЕГДА','/rewards/pass/one-piece-tag-ru.png'),
  ('tag:pass-bleach','БАНКАЙ','/rewards/pass/bleach-tag-ru.png'),
  ('tag:pass-black-clover','ЧЁРНЫЕ БЫКИ','/rewards/pass/black-clover-tag-ru.png'),
  ('tag:pass-naruto','ВОЛЯ ОГНЯ','/rewards/pass/naruto-tag-ru.png'),
  ('tag:pass-four-worlds','ЧЕТЫРЕ МИРА','/rewards/pass/four-worlds-tag-ru.png'),
  ('tag:pass-oni','ПРОБУЖДЕНИЕ ОНИ','/rewards/pass/oni-final-tag-ru.png')
) AS t(id,name,image)
WHERE c.id=t.id AND c.access_type='battlepass';

UPDATE pass_rewards AS r SET name=t.name,preview=t.image
FROM (VALUES
  ('tag:pass-one-piece','НАКАМА НАВСЕГДА','/rewards/pass/one-piece-tag-ru.png'),
  ('tag:pass-bleach','БАНКАЙ','/rewards/pass/bleach-tag-ru.png'),
  ('tag:pass-black-clover','ЧЁРНЫЕ БЫКИ','/rewards/pass/black-clover-tag-ru.png'),
  ('tag:pass-naruto','ВОЛЯ ОГНЯ','/rewards/pass/naruto-tag-ru.png'),
  ('tag:pass-four-worlds','ЧЕТЫРЕ МИРА','/rewards/pass/four-worlds-tag-ru.png'),
  ('tag:pass-oni','ПРОБУЖДЕНИЕ ОНИ','/rewards/pass/oni-final-tag-ru.png')
) AS t(id,name,image)
WHERE r.season_id='oni-awakening' AND r.cosmetic_id=t.id;
