# Migration notes

One line per migration, for the report. Migrations are forward only; there is no down
script. To undo one during development, drop the database and re-run `npm run migrate`
against a fresh schema.

- `001_schema_migrations.sql` — creates the table the runner uses to track which files have
  already been applied.
- `002_enums.sql` — the closed vocabularies used throughout the schema: roles, period
  status, account type, normal balance, entry source/status, document status, confidence,
  audit action.
- `003_clients_and_users.sql` — clients, users (id matches the Supabase auth user id), and
  the client_users join table controlling which user may access which client's books.
- `004_fiscal_periods.sql` — accounting periods, with a check that end_date is after
  start_date and a uniqueness constraint per client per start date.
- `005_accounts.sql` — the chart of accounts, with a database-level check that
  normal_balance agrees with account type, as a second line of defence behind the service
  layer that derives it.
- `006_journal_entries.sql` — journal entry headers. entry_no is nullable and assigned only
  at posting time from a gapless per-client sequence.
- `007_journal_lines_and_triggers.sql` — journal lines, the single-sided debit/credit check,
  the deferred constraint trigger that enforces debits equal credits for every entry, and
  the triggers that make a posted entry immutable.
- `008_audit_log.sql` — the append-only audit trail, with a trigger that blocks UPDATE and
  DELETE outright.
- `009_documents.sql` — uploaded source documents, their Claude extraction and suggested
  coding, and a log of Claude API token usage for cost reporting.
