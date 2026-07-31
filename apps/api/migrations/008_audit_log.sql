CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  client_id uuid REFERENCES clients (id),
  actor_id uuid NOT NULL REFERENCES users (id),
  action audit_action NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  before jsonb,
  after jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_entity ON audit_log (entity_type, entity_id);
CREATE INDEX idx_audit_log_actor ON audit_log (actor_id);
CREATE INDEX idx_audit_log_client_occurred ON audit_log (client_id, occurred_at);

-- Append only. An auditor's first question about any figure is who put it there and when;
-- that answer is worthless if the log itself can be edited. Block UPDATE and DELETE with a
-- trigger, since REVOKE alone would only stop the application role, not a superuser session
-- run by mistake against the wrong table.
CREATE OR REPLACE FUNCTION trg_audit_log_append_only() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION trg_audit_log_append_only();
