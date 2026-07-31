CREATE TABLE fiscal_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status period_status NOT NULL DEFAULT 'OPEN',
  closed_at timestamptz,
  closed_by uuid REFERENCES users (id),
  CONSTRAINT fiscal_periods_dates_check CHECK (end_date > start_date),
  CONSTRAINT fiscal_periods_client_start_unique UNIQUE (client_id, start_date)
);

CREATE INDEX idx_fiscal_periods_client_id ON fiscal_periods (client_id);
