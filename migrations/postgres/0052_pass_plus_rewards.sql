-- Keep the existing reward/claim keys and all historical claims unchanged.
-- cosmetic_id is the legacy reward key; Plus keys do not create fake cosmetics.
ALTER TABLE pass_rewards DROP CONSTRAINT pass_rewards_cosmetic_id_fkey;
ALTER TABLE pass_rewards DROP CONSTRAINT pass_rewards_kind_check;
ALTER TABLE pass_rewards ADD COLUMN plus_days integer;
ALTER TABLE pass_rewards ADD COLUMN cosmetic_ref text GENERATED ALWAYS AS
 (CASE WHEN kind='plus' THEN NULL ELSE cosmetic_id END) STORED REFERENCES cosmetics(id);
ALTER TABLE pass_rewards ADD CONSTRAINT pass_rewards_kind_check CHECK(kind IN ('pin','tag','frame','background','plus'));
ALTER TABLE pass_rewards ADD CONSTRAINT pass_rewards_plus_check CHECK(
 (kind='plus' AND plus_days IS NOT NULL AND plus_days BETWEEN 1 AND 365 AND cosmetic_id LIKE 'plus:%' AND preview='') OR
 (kind<>'plus' AND plus_days IS NULL));
ALTER TABLE pass_seasons ADD COLUMN expected_rewards jsonb NOT NULL DEFAULT '[]'::jsonb;
