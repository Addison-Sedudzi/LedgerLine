CREATE TABLE journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  period_id uuid NOT NULL REFERENCES fiscal_periods (id),
  -- Assigned from a per-client gapless sequence at the moment of posting, not at creation.
  -- Null while the entry is a draft.
  entry_no bigint,
  entry_date date NOT NULL,
  narration text NOT NULL,
  source journal_entry_source NOT NULL DEFAULT 'MANUAL',
  status journal_entry_status NOT NULL DEFAULT 'DRAFT',
  reverses_entry_id uuid REFERENCES journal_entries (id),
  created_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  posted_by uuid REFERENCES users (id),
  posted_at timestamptz,
  -- Postgres treats every NULL as distinct for a UNIQUE constraint, so multiple drafts
  -- (entry_no IS NULL) are allowed; only assigned entry numbers are required to be unique.
  CONSTRAINT journal_entries_client_entry_no_unique UNIQUE (client_id, entry_no)
);

CREATE INDEX idx_journal_entries_client_id ON journal_entries (client_id);
CREATE INDEX idx_journal_entries_period_id ON journal_entries (period_id);
CREATE INDEX idx_journal_entries_client_date ON journal_entries (client_id, entry_date);
CREATE INDEX idx_journal_entries_reverses ON journal_entries (reverses_entry_id);
