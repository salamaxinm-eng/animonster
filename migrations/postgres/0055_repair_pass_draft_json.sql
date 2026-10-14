-- Older PostgreSQL writes serialized JSON strings a second time. Repair drafts only.
-- New application writes cast parameters through text before JSONB.
UPDATE pass_seasons SET tasks=(tasks #>> '{}')::jsonb
WHERE status='draft' AND jsonb_typeof(tasks)='string';
UPDATE pass_seasons SET genres=(genres #>> '{}')::jsonb
WHERE status='draft' AND jsonb_typeof(genres)='string';
