CREATE TABLE collection_lists (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at bigint NOT NULL,
  UNIQUE(user_id, name)
);

CREATE INDEX collection_lists_user_created
  ON collection_lists(user_id, created_at);

CREATE TABLE collection_list_items (
  list_id text NOT NULL REFERENCES collection_lists(id) ON DELETE CASCADE,
  anime_id integer NOT NULL,
  PRIMARY KEY(list_id, anime_id)
);

CREATE INDEX collection_list_items_anime
  ON collection_list_items(anime_id);

UPDATE history
SET completed = CASE WHEN watched_seconds >= 720 THEN 1 ELSE 0 END;
