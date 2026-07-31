CREATE TABLE journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES journal_entries (id) ON DELETE CASCADE,
  line_no int NOT NULL,
  account_id uuid NOT NULL REFERENCES accounts (id),
  debit numeric(18,2) NOT NULL DEFAULT 0,
  credit numeric(18,2) NOT NULL DEFAULT 0,
  description text,
  CONSTRAINT journal_lines_entry_line_no_unique UNIQUE (entry_id, line_no),
  CONSTRAINT journal_lines_amounts_non_negative CHECK (debit >= 0 AND credit >= 0),
  -- A line carries an amount in exactly one column, never both, never neither.
  CONSTRAINT journal_lines_single_sided CHECK (
    (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)
  )
);

CREATE INDEX idx_journal_lines_entry_id ON journal_lines (entry_id);
CREATE INDEX idx_journal_lines_account_id ON journal_lines (account_id);

-- ============================================================================
-- THE SINGLE MOST IMPORTANT RULE IN THIS SYSTEM.
--
-- A journal entry is not permitted to exist, however briefly, in an unbalanced state once
-- a transaction commits. The application checks this before it ever issues an INSERT, but
-- application code is where bugs live, so the guarantee that actually matters is the one
-- enforced here, in the database, where it cannot be bypassed by a bug upstream.
--
-- The trigger is DEFERRABLE INITIALLY DEFERRED so that a header and its lines can be
-- inserted as separate statements within one transaction; the check runs once at COMMIT,
-- against the final state of the entry, rather than after every individual line insert.
-- ============================================================================
CREATE OR REPLACE FUNCTION trg_check_journal_entry_balance() RETURNS TRIGGER AS $$
DECLARE
  v_entry_id uuid;
  v_debit numeric(18,2);
  v_credit numeric(18,2);
BEGIN
  v_entry_id := COALESCE(NEW.entry_id, OLD.entry_id);

  -- The entry itself may have been deleted in this same transaction (a draft entry is
  -- deleted by cascading to its lines). There is nothing left to balance in that case.
  IF NOT EXISTS (SELECT 1 FROM journal_entries WHERE id = v_entry_id) THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
    INTO v_debit, v_credit
    FROM journal_lines
    WHERE entry_id = v_entry_id;

  IF v_debit <> v_credit THEN
    RAISE EXCEPTION 'Journal entry % does not balance: debit total % does not equal credit total % (difference %)',
      v_entry_id, v_debit, v_credit, (v_debit - v_credit);
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_journal_lines_balance
  AFTER INSERT OR UPDATE OR DELETE ON journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION trg_check_journal_entry_balance();

-- ============================================================================
-- IMMUTABILITY. A posted journal entry is a historical fact. It is corrected by posting a
-- reversing entry that references it, never by editing or deleting it. The one narrow
-- exception is the update that marks an entry REVERSED when a reversal is created against
-- it, which changes only the status column.
-- ============================================================================
CREATE OR REPLACE FUNCTION trg_journal_entries_immutable() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('POSTED', 'REVERSED') THEN
      RAISE EXCEPTION 'Journal entry % is posted and cannot be deleted', OLD.id;
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'POSTED' THEN
    IF NEW.status = 'REVERSED'
       AND NEW.client_id = OLD.client_id AND NEW.period_id = OLD.period_id
       AND NEW.entry_no = OLD.entry_no AND NEW.entry_date = OLD.entry_date
       AND NEW.narration = OLD.narration AND NEW.source = OLD.source
       AND NEW.created_by = OLD.created_by AND NEW.created_at = OLD.created_at
       AND NEW.posted_by = OLD.posted_by AND NEW.posted_at = OLD.posted_at
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Journal entry % is posted and is immutable', OLD.id;
  ELSIF OLD.status = 'REVERSED' THEN
    RAISE EXCEPTION 'Journal entry % has been reversed and is immutable', OLD.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_journal_entries_immutable
  BEFORE UPDATE OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION trg_journal_entries_immutable();

CREATE OR REPLACE FUNCTION trg_journal_lines_immutable() RETURNS TRIGGER AS $$
DECLARE
  v_status journal_entry_status;
  v_entry_id uuid;
BEGIN
  v_entry_id := COALESCE(OLD.entry_id, NEW.entry_id);
  SELECT status INTO v_status FROM journal_entries WHERE id = v_entry_id;

  IF v_status IN ('POSTED', 'REVERSED') THEN
    RAISE EXCEPTION 'Journal lines belonging to posted entry % cannot be changed', v_entry_id;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_journal_lines_immutable
  BEFORE UPDATE OR DELETE ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION trg_journal_lines_immutable();
