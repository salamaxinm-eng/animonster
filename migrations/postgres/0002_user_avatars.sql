CREATE TABLE user_avatars (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
  data bytea NOT NULL,
  updated_at bigint NOT NULL
);
