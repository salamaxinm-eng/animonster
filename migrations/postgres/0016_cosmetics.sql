ALTER TABLE users ADD COLUMN tag text;

CREATE TABLE cosmetics (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('tag','pin','frame')),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  rarity text NOT NULL DEFAULT 'common' CHECK (rarity IN ('common','rare','epic','legendary')),
  image text,
  style_json jsonb,
  access_type text NOT NULL DEFAULT 'free' CHECK (access_type IN ('free','plus','achievement','referral','admin')),
  active integer NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  created_at bigint NOT NULL
);

CREATE INDEX cosmetics_catalog ON cosmetics(kind,active,sort_order,slug);

CREATE TABLE user_cosmetics (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cosmetic_id text NOT NULL REFERENCES cosmetics(id) ON DELETE CASCADE,
  unlocked_at bigint NOT NULL,
  source text NOT NULL CHECK (source IN ('free','plus','achievement','referral','admin')),
  source_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY(user_id,cosmetic_id)
);

CREATE UNIQUE INDEX user_cosmetics_source_key
  ON user_cosmetics(user_id,source,source_key)
  WHERE source_key IS NOT NULL;

INSERT INTO cosmetics(id,kind,slug,name,description,rarity,image,access_type,sort_order,created_at)
SELECT 'pin:' || slug,'pin',slug,initcap(replace(slug,'-',' ')),
  'Пин из коллекции AniMonster Plus','rare','/pins/' || slug || '.png','plus',ordinality,0
FROM unnest(ARRAY[
  'one-piece','naruto','death-note','attack-on-titan','demon-slayer','jujutsu-kaisen',
  'bleach','dragon-ball','pokemon','sailor-moon','fullmetal-alchemist','hunter-x-hunter',
  'one-punch-man','my-hero-academia','sword-art-online','tokyo-ghoul','evangelion',
  'cowboy-bebop','chainsaw-man','spy-family','frieren','berserk','jojo','haikyuu',
  'blue-lock','your-name','spirited-away','howl','mob-psycho-100','vinland-saga'
]) WITH ORDINALITY AS item(slug,ordinality)
ON CONFLICT(slug) DO NOTHING;

INSERT INTO cosmetics(id,kind,slug,name,description,rarity,style_json,access_type,sort_order,created_at) VALUES
  ('frame:lime','frame','lime','Лайм','Лаймовая рамка AniMonster Plus','rare','{"class":"lime"}','plus',10,0),
  ('frame:violet','frame','violet','Фиолетовая','Фиолетовая рамка AniMonster Plus','rare','{"class":"violet"}','plus',20,0),
  ('frame:fire','frame','fire','Пламя','Огненная рамка AniMonster Plus','epic','{"class":"fire"}','plus',30,0),
  ('frame:ice','frame','ice','Лёд','Ледяная рамка AniMonster Plus','epic','{"class":"ice"}','plus',40,0),
  ('frame:violet-neon','frame','violet-neon','Violet Neon','Мягкая неоновая рамка Plus','epic','{"class":"violet-neon"}','plus',50,0),
  ('frame:premium-glow','frame','premium-glow','Premium Glow','Премиальная рамка с мягким свечением','legendary','{"class":"premium-glow","animated":true}','plus',60,0),
  ('tag:plus','tag','plus','PLUS','Эксклюзивный тег подписчика','rare','{"accent":"violet"}','plus',10,0),
  ('tag:supporter','tag','supporter','Поддержал AniMonster','Тег поддержки проекта','epic','{"accent":"lime"}','plus',20,0)
ON CONFLICT(slug) DO NOTHING;
