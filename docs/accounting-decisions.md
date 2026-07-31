# Accounting policy decisions

Choices made in code that a reader might reasonably ask "why that way, and not another
defensible way." Each is one line on the why; the code comment at the cited location has the
detail.

- **Correction by reversal, never by edit.** A posted entry is immutable at the database
  level (`apps/api/migrations/007_journal_lines_and_triggers.sql`). Why: a ledger is a
  historical record; editing it after the fact destroys the audit trail that makes the
  numbers trustworthy in the first place.
- **Entry numbers are gapless and assigned only at posting time**, via an advisory lock
  (`JournalRepository.nextEntryNo`). Why: a missing number in a printed document sequence is
  itself a red flag to an auditor, so numbers are never reserved for a draft and then
  abandoned.
- **Only POSTED entries affect any balance, ledger or statement.** Enforced by filtering on
  `status = 'POSTED'` in every read query (`accounts.repository.ts`, `ledger.repository.ts`,
  `reports.repository.ts`). Why: a draft is a proposal, not a fact, and must never leak into
  a number someone relies on.
- **Half-up rounding to two decimal places**, via `Decimal.ROUND_HALF_UP` in
  `packages/shared/src/money.ts`. Why: this is the conventional rounding rule in accounting
  (as opposed to banker's rounding), and doing it in one shared class means every part of
  the system rounds the same way.
- **Money is a decimal string end to end, wrapped in a `Money` class for arithmetic** — never
  a JavaScript `number`. Why: binary floating point cannot represent every value a
  `NUMERIC(18,2)` column can, and a ledger cannot tolerate a rounding error a few cents wide.
- **Account normal balance is derived from type, never supplied by the caller**
  (`deriveNormalBalance` in `accounts.service.ts`, backed by a database CHECK constraint).
  Why: this is a fact about the account type, not a choice a form should be able to get
  wrong.
- **An account with a child account becomes non-postable automatically**
  (`AccountsService.create`). Why: only a leaf account should carry postings; a parent
  account exists to group its children in reports, not to receive entries directly.
