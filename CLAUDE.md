# LedgerLine

## What this project is

LedgerLine is a double entry accounting system for small bookkeeping practices in Ghana.
A bookkeeper records transactions for a client business, runs the period end procedure,
and produces financial statements. The system must be correct before it is convenient.

**Current build status:** a scoped-down vertical slice (see `docs/cut-scope.md`). The core
ledger — accounts, posting engine, general ledger, trial balance, income statement, balance
sheet — and one AI integration (document extraction and coding, human-approved) are
built. Receivables/payables, cash/bank reconciliation, fixed assets, the period-close wizard,
and pre-close review/narrative commentary are not yet built.

## Stack

- Monorepo with two folders: `apps/api` (NestJS) and `apps/web` (React + Vite).
- TypeScript everywhere. Strict mode on. No `any` without a written reason.
- PostgreSQL hosted on Supabase.
- Database access through the `pg` driver with hand written SQL. Do NOT introduce an ORM
  such as Prisma or TypeORM. SQL is written explicitly so that the accounting logic is
  readable and reviewable.
- Supabase Auth for login. Supabase Storage for uploaded documents.
- OpenAI API for document extraction and account coding. All calls are made from the API
  server (`AiService`, `apps/api/src/intelligence/ai.service.ts`). The API key never
  reaches the browser.

## Accounting rules that must never be broken

1. Every journal entry balances. The sum of debits equals the sum of credits, to the cent.
   This is enforced in the database with a deferred constraint trigger and checked again in
   the service layer immediately before posting.
2. Money is stored as NUMERIC(18,2). Never a float, never a double, never a JavaScript
   number for a stored amount. In TypeScript, amounts are decimal strings (`MoneyAmount`) at
   rest and wrapped in the `Money` class (`packages/shared/src/money.ts`, backed by
   decimal.js) for arithmetic.
3. A posted journal entry is immutable. It is never updated and never deleted — enforced by
   a database trigger, not just application logic. A mistake is corrected by posting a
   reversing entry that references the original.
4. A journal line carries an amount in either the debit column or the credit column, never
   both, and never a negative number.
5. Account types are ASSET, LIABILITY, EQUITY, INCOME, EXPENSE. Assets and expenses have a
   debit normal balance. Liabilities, equity and income have a credit normal balance. This is
   derived from type, never supplied by the caller, and double-checked with a database CHECK
   constraint.
6. Postings are only permitted into a period whose status is OPEN. A CLOSED period rejects
   all writes.
7. Every write to the ledger happens inside a single database transaction
   (`DatabaseService.transaction`). If any part fails, nothing is written.
8. Every create, post, reverse, approve and reject action writes a row to the audit log
   (`AuditService`), naming the user, the time, and the before and after state. The audit log
   itself is append-only, enforced by a trigger.
9. The OpenAI API never calculates a figure and never posts an entry. It extracts,
   classifies and drafts. All arithmetic is done in SQL or TypeScript. Everything the model
   produces enters a review queue (the documents module) and is committed only by a named
   human user, as a DRAFT — never posted automatically. See `docs/ai-boundary.md`.

## Conventions

- Every table that holds client data has a `client_id` column and every query filters on it.
  `ClientScopeGuard` is the boundary that checks a user may access the client id a request
  claims to act on.
- Timestamps are `timestamptz`, stored in UTC.
- Dates that are accounting dates (transaction date, period start) are `date`, not timestamp.
- Table and column names are snake_case. TypeScript is camelCase. Map at the
  repository/service boundary (see `toAccountDto` in `accounts.service.ts` and `toEntryDto`
  in `journal.service.ts`), not in the controller.
- Every endpoint validates its input with a DTO and class-validator before touching a service.
- Errors are thrown as typed domain exceptions (`common/errors/domain-errors.ts`) and
  translated to HTTP status codes in one place (`GlobalExceptionFilter`), not scattered
  through the controllers.
- No business logic in controllers. Controllers parse and delegate.
- Write the test before or with the feature for anything that touches the ledger.

## What NOT to build

Payroll, tax returns, inventory valuation, cost of goods sold, multiple currencies,
time tracking, client billing, natural language querying of the ledger. If a prompt seems to
ask for one of these, stop and ask.

## How I want you to work

- Before writing code for a new module, state the plan in a few lines and list the files you
  will create or change.
- Prefer small, readable functions over clever ones. This code will be read by an examiner.
- When you are unsure about an accounting rule, ask rather than guess.
- Do not install a dependency without saying why it is needed.
