# What was cut, and why

The full `LedgerLine-Prompts.md` specification is 25 deliverables — realistically a
multi-month solo build. Given a one-week deadline, this build is a vertical slice through
the parts that prove the central claim (a correct double-entry ledger, with one AI feature
that is human-approved by construction) rather than a shallow pass across all 25.

## Built

Deliverables 1–8 (foundation, schema, seed, NestJS core, auth/audit, chart of accounts,
posting engine, ledgers/trial balance), a trimmed 10 (income statement + balance sheet, no
cash flow or changes in equity statement), a trimmed 14 (document extraction and coding,
human-approved into a draft — the assisted-reconciliation half of 14 doesn't apply since
reconciliation itself is cut), a trimmed 16 (accounting correctness suite covering the
invariants that apply to what's built), and a trimmed 17–20/22 on the frontend (design
system, app shell, journal entry, chart of accounts, trial balance, statements, document
inbox and review).

## Cut, with what it would take to add back

- **Receivables/payables and ageing (11).** Needs `customers`, `suppliers`, `sales_invoices`,
  `purchase_bills`, `allocations` tables (already drafted in the original spec's migration
  list) and a module that posts through the existing `JournalService` — the posting engine
  underneath is already built, so this is additive, not a redesign. Roughly 2–3 days.
- **Cash book, petty cash, bank reconciliation (12).** Needs `bank_accounts`,
  `bank_statement_lines` tables, CSV import, and matching logic. The `suggestMatches()` seam
  described in the original spec was never started. Roughly 2–3 days including the
  reconciliation screen, which is the most fiddly UI in the whole spec.
- **Fixed assets and depreciation (13).** Needs `fixed_assets`, `depreciation_charges`
  tables and a depreciation-run job. Self-contained; doesn't block anything else. 1–2 days.
- **Period close wizard, year-end rollover (9).** The `fiscal_periods` table and OPEN/CLOSED
  enforcement exist; what's missing is the checklist logic, adjusting-entry helpers, and the
  actual closing-entries posting (debit every income account, credit every expense account,
  net to retained earnings). This is genuinely accounting-sensitive and deserves the time the
  original spec gives it — not something to rush. 2 days.
- **Pre-close review and narrative commentary (15).** A second Claude integration, read-only
  by construction (same discipline as document intelligence — see `docs/ai-boundary.md`).
  Needs the deterministic-summary SQL queries plus two more prompts. 1–2 days.
- **Deployment (24), full documentation set (25).** This build runs locally only; Dockerfiles,
  CI beyond lint/typecheck/test, and Render/Vercel deployment steps are not configured.

## Never in scope

Payroll, statutory tax returns, inventory valuation/COGS, multiple currencies, natural
language querying of the ledger — excluded in the original spec and still excluded here.
