CREATE TABLE anime_relations (
  anime_id integer NOT NULL REFERENCES anime_cache(id) ON DELETE CASCADE,
  related_anime_id integer NOT NULL,
  relation text NOT NULL,
  relation_russian text NOT NULL DEFAULT '',
  related_title text NOT NULL DEFAULT '',
  related_kind text NOT NULL DEFAULT '',
  related_year integer NOT NULL DEFAULT 0,
  checked_at bigint NOT NULL,
  PRIMARY KEY(anime_id,related_anime_id,relation)
);
CREATE INDEX anime_relations_related ON anime_relations(related_anime_id,relation,anime_id);
CREATE INDEX anime_relations_mainline ON anime_relations(relation,anime_id,related_anime_id);

CREATE TABLE anime_relation_state (
  anime_id integer PRIMARY KEY REFERENCES anime_cache(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ok','not_found','error')),
  attempts integer NOT NULL DEFAULT 0,
  checked_at bigint NOT NULL DEFAULT 0,
  last_error text
);
INSERT INTO anime_relation_state(anime_id) SELECT id FROM anime_cache
ON CONFLICT(anime_id) DO NOTHING;
