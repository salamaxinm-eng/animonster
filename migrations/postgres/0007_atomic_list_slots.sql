ALTER TABLE collection_lists ADD COLUMN slot integer;

WITH ranked AS (
  SELECT id,row_number() OVER (PARTITION BY user_id ORDER BY created_at,id) AS slot
  FROM collection_lists
)
UPDATE collection_lists
SET slot=ranked.slot
FROM ranked
WHERE collection_lists.id=ranked.id;

ALTER TABLE collection_lists ALTER COLUMN slot SET NOT NULL;
CREATE UNIQUE INDEX collection_lists_user_slot ON collection_lists(user_id,slot);
