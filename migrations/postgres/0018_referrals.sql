CREATE TABLE referral_codes (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_at bigint NOT NULL
);

CREATE TABLE referrals (
  id text PRIMARY KEY,
  referrer_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id text NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  code text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','qualified','rejected')),
  registered_at bigint NOT NULL,
  qualified_at bigint,
  created_at bigint NOT NULL,
  CHECK (referrer_id <> referred_user_id)
);

CREATE INDEX referrals_referrer_status
  ON referrals(referrer_id,status,created_at);

CREATE TABLE referral_reward_claims (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  milestone integer NOT NULL,
  created_at bigint NOT NULL,
  PRIMARY KEY(user_id,milestone)
);
