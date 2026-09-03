-- Caches an account suggestion for a given description, per client, so the same typed
-- description (e.g. "fuel", "rent") is never sent to the AI twice. No expiry: a stale
-- suggestion is a minor inconvenience (it is never applied automatically, only offered),
-- not a correctness risk.
CREATE TABLE account_suggestion_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  description_key text NOT NULL,
  account_id uuid REFERENCES accounts (id) ON DELETE SET NULL,
  confidence confidence_level,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_suggestion_cache_unique UNIQUE (client_id, description_key)
);
