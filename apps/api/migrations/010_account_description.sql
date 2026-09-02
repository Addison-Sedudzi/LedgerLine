-- Optional free-text note on an account (e.g. "current account at GCB, acct ending 4471").
-- Nullable and additive: existing rows get NULL, nothing else about the table changes.
ALTER TABLE accounts ADD COLUMN description text;
