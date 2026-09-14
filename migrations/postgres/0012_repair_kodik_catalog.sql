UPDATE kodik_match_queue
SET reason = 'Ожидает автоматического сопоставления',
    updated_at = (extract(epoch FROM clock_timestamp()) * 1000)::bigint
WHERE status = 'pending'
  AND reason = 'Недостаточно метаданных или отсутствует HTTPS-постер';

UPDATE anime_cache AS anime
SET primary_provider = 'kodik',
    data = jsonb_set(
      jsonb_set(anime.data::jsonb, '{primary_provider}', '"kodik"'::jsonb, true),
      '{providers}',
      CASE
        WHEN COALESCE(anime.data::jsonb->'providers', '[]'::jsonb) ? 'aniliberty'
          THEN '["kodik","aniliberty"]'::jsonb
        ELSE '["kodik"]'::jsonb
      END,
      true
    )::text
WHERE anime.primary_provider <> 'kodik'
  AND EXISTS (
    SELECT 1
    FROM anime_sources AS source
    WHERE source.provider = 'kodik'
      AND source.active = 1
      AND source.anime_id = anime.id
  );
