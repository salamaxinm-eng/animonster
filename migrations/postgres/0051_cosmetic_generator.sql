CREATE TABLE cosmetic_generations (
  id text PRIMARY KEY,
  batch_id text NOT NULL,
  actor_id text NOT NULL REFERENCES users(id),
  anime text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('pin','frame')),
  rarity text NOT NULL CHECK (rarity IN ('common','legendary')),
  concept text NOT NULL,
  prompt text NOT NULL,
  model text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  full_png bytea NOT NULL,
  thumb_png bytea NOT NULL,
  cosmetic_id text UNIQUE REFERENCES cosmetics(id),
  created_at bigint NOT NULL,
  published_at bigint
);
CREATE INDEX cosmetic_generations_history ON cosmetic_generations(created_at DESC);
