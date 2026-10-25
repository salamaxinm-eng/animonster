ALTER TABLE users ADD COLUMN vk_url text;
ALTER TABLE users ADD COLUMN telegram_url text;
ALTER TABLE users ADD COLUMN show_vk integer NOT NULL DEFAULT 0 CHECK (show_vk IN (0,1));
ALTER TABLE users ADD COLUMN show_telegram integer NOT NULL DEFAULT 0 CHECK (show_telegram IN (0,1));
