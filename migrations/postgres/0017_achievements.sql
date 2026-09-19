CREATE TABLE achievements (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL,
  metric text NOT NULL CHECK (metric IN ('completed_episodes','anime_completed_episodes')),
  threshold integer NOT NULL CHECK (threshold > 0),
  anime_id integer,
  active integer NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE achievement_rewards (
  achievement_id text NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  cosmetic_id text NOT NULL REFERENCES cosmetics(id) ON DELETE CASCADE,
  PRIMARY KEY(achievement_id,cosmetic_id)
);

CREATE TABLE user_achievements (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id text NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  unlocked_at bigint NOT NULL,
  PRIMARY KEY(user_id,achievement_id)
);

CREATE INDEX user_achievements_user_unlocked
  ON user_achievements(user_id,unlocked_at DESC);

INSERT INTO cosmetics(id,kind,slug,name,description,rarity,style_json,access_type,sort_order,created_at) VALUES
  ('tag:hundred-episodes','tag','hundred-episodes','Сотня серий','Посмотреть 100 серий','rare','{"accent":"lime"}','achievement',100,0),
  ('tag:binge-watcher','tag','binge-watcher','Запойный зритель','Посмотреть 500 серий','epic','{"accent":"violet"}','achievement',110,0),
  ('tag:animonster-legend','tag','animonster-legend','Легенда AniMonster','Посмотреть 1000 серий','legendary','{"accent":"violet"}','achievement',120,0),
  ('tag:mugiwara','tag','mugiwara','Мугивара','Посмотреть 100 серий One Piece','epic','{"accent":"lime"}','achievement',130,0),
  ('frame:one-piece-master','frame','one-piece-master','Воля пирата','Посмотреть 500 серий One Piece','legendary','{"class":"one-piece-master"}','achievement',130,0)
ON CONFLICT(slug) DO NOTHING;

INSERT INTO achievements(id,slug,name,description,category,metric,threshold,anime_id,active,sort_order) VALUES
  ('achievement:episodes-100','episodes-100','Сотня серий','Посмотри 100 серий на AniMonster','watching','completed_episodes',100,NULL,1,10),
  ('achievement:episodes-500','episodes-500','Запойный зритель','Посмотри 500 серий на AniMonster','watching','completed_episodes',500,NULL,1,20),
  ('achievement:episodes-1000','episodes-1000','Легенда AniMonster','Посмотри 1000 серий на AniMonster','watching','completed_episodes',1000,NULL,1,30),
  ('achievement:one-piece-100','one-piece-100','Мугивара','Посмотри 100 серий One Piece','anime','anime_completed_episodes',100,21,1,40),
  ('achievement:one-piece-500','one-piece-500','Воля пирата','Посмотри 500 серий One Piece','anime','anime_completed_episodes',500,21,1,50)
ON CONFLICT(slug) DO NOTHING;

INSERT INTO achievement_rewards(achievement_id,cosmetic_id) VALUES
  ('achievement:episodes-100','tag:hundred-episodes'),
  ('achievement:episodes-500','tag:binge-watcher'),
  ('achievement:episodes-1000','tag:animonster-legend'),
  ('achievement:one-piece-100','tag:mugiwara'),
  ('achievement:one-piece-500','frame:one-piece-master')
ON CONFLICT DO NOTHING;
