UPDATE anime_search_metadata
SET status = 'pending'
WHERE version < 3;
