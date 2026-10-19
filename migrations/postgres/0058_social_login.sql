-- Additive: existing VK flows and identities keep their behavior.
ALTER TABLE auth_flows ADD COLUMN provider text NOT NULL DEFAULT 'vk'
  CHECK (provider IN ('vk','google','telegram'));
ALTER TABLE auth_flows ADD COLUMN nonce text;
ALTER TABLE auth_flows ADD COLUMN user_id text REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE auth_flows ADD COLUMN session_hash text;

-- Telegram's OIDC subject is not the numeric Telegram user/chat ID.
ALTER TABLE auth_identities ADD COLUMN provider_account_id text;
CREATE UNIQUE INDEX auth_identities_telegram_account
  ON auth_identities(provider_account_id) WHERE provider='telegram' AND provider_account_id IS NOT NULL;
