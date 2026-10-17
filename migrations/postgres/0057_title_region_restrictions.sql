CREATE TABLE title_region_restrictions (
  anime_id integer PRIMARY KEY CHECK (anime_id BETWEEN 1 AND 999999999),
  source_url text NOT NULL,
  reason text NOT NULL DEFAULT '',
  created_by text REFERENCES users(id) ON DELETE SET NULL,
  updated_by text REFERENCES users(id) ON DELETE SET NULL,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL
);

INSERT INTO title_region_restrictions(anime_id,source_url,reason,created_at,updated_at)
SELECT id,'https://animonster.su/anime/' || id,'Уведомление о нарушении авторских прав',
       (extract(epoch FROM now())*1000)::bigint,(extract(epoch FROM now())*1000)::bigint
FROM (VALUES (60058),(57334),(60543)) AS initial(id);
