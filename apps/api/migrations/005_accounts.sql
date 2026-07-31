CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  type account_type NOT NULL,
  normal_balance normal_balance NOT NULL,
  parent_id uuid REFERENCES accounts (id),
  is_postable boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT accounts_client_code_unique UNIQUE (client_id, code),
  -- Defense in depth: normal_balance is derived from type in the service layer, but the
  -- database refuses to store a combination that contradicts basic accounting rules even
  -- if some future code path forgets to derive it.
  CONSTRAINT accounts_normal_balance_matches_type CHECK (
    (type IN ('ASSET', 'EXPENSE') AND normal_balance = 'DEBIT') OR
    (type IN ('LIABILITY', 'EQUITY', 'INCOME') AND normal_balance = 'CREDIT')
  )
);

CREATE INDEX idx_accounts_client_id ON accounts (client_id);
CREATE INDEX idx_accounts_parent_id ON accounts (parent_id);
