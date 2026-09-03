# LedgerLine

A double-entry accounting system for small bookkeeping practices in Ghana: source document
to financial statements, with an audit trail, role separation, locked periods, and the
OpenAI API assisting on document reading — never on arithmetic or posting.

## Who this is for

A bookkeeping practice that records transactions for client businesses, runs a period-end
procedure, and produces financial statements. The system is built to be correct before it is
convenient: every accounting rule in `CLAUDE.md` is enforced in the database, not just in
application code.

## Scope

This build is a working vertical slice through the full `LedgerLine-Prompts.md` specification,
scoped down to fit a one-week build. **Built:**

- Chart of accounts, with the debit/credit normal-balance rule enforced in the database.
- The posting engine: draft entries, validation, posting with a gapless per-client entry
  number sequence, and reversal. A posted entry is immutable, enforced by a database trigger.
- General ledger and trial balance, with divisible-by-nine / doubled-amount diagnostics
  when the trial balance doesn't agree.
- Income statement and balance sheet, with comparatives. The balance sheet refuses to render
  itself if it does not balance.
- Document intelligence: upload a photo of an invoice or receipt, the AI extracts the
  fields and suggests an expense account, a human edits and approves it into a **draft**
  journal entry. Nothing the model produces is ever posted automatically.
- Role-based access (preparer / reviewer / admin), Supabase JWT auth, an append-only audit
  log recording every create/post/reverse/approve/reject action.
- An accounting-correctness test suite that runs against a real Postgres database.

**Deliberately not built in this pass** (see `docs/cut-scope.md` for the reasoning and what
each would take to add back): receivables/payables and ageing, cash book/petty cash/bank
reconciliation, fixed assets and depreciation, the guided period-close wizard and year-end
rollover, pre-close anomaly review and narrative commentary, deployment configuration.

**Never in scope, by design:** payroll, statutory tax returns, inventory valuation, multiple
currencies, natural language querying of the ledger. The OpenAI API extracts, classifies and
drafts; it never computes a figure and never posts an entry. See `docs/ai-boundary.md`.

## Architecture

```
apps/api        NestJS. Controllers parse and delegate; services hold the accounting rules;
                 repositories hold hand-written parameterised SQL. No ORM.
apps/web        React + Vite. TanStack Query for server state. A ledger-paper design system
                 (packages/shared for cross-cutting types and Money arithmetic).
packages/shared TypeScript types and the Money class (decimal.js) used by both apps.
```

PostgreSQL runs on Supabase. Supabase Auth issues the JWTs the API verifies. Supabase
Storage holds uploaded documents. The OpenAI API is called only from `apps/api` — the key
never reaches the browser bundle.

## Prerequisites

- Node.js 20+
- A Supabase project (free tier is enough)
- An OpenAI API key, if you want document extraction to work (everything else runs
  without one — see `docs/ai-boundary.md` for the degraded behaviour)

## Setup from a clean machine

1. **Install dependencies**

   ```
   npm install
   ```

2. **Create a Supabase project** at [supabase.com](https://supabase.com), then collect:
   - `DATABASE_URL` — Project Settings → Database → Connection string → URI (use the
     "Transaction pooler" connection string; append `?sslmode=require` if it isn't already there)
   - `SUPABASE_URL` — Project Settings → API → Project URL
   - `SUPABASE_ANON_KEY` — Project Settings → API → `anon` `public` key
   - `SUPABASE_SERVICE_ROLE_KEY` — Project Settings → API → `service_role` `secret` key
     (server only — never put this in the web app's env)
   - `SUPABASE_JWT_SECRET` — Project Settings → API → JWT Settings → JWT Secret

3. **Create a Storage bucket** named `documents` in the Supabase dashboard (Storage → New
   bucket). Private is fine — the API downloads through it with the service role key, and
   the frontend fetches images through an authenticated API endpoint, never directly.

4. **Create the demo users in Supabase Auth** (Authentication → Users → Add user) with these
   exact emails, so the seed script's `client_users` links resolve to real logins:
   - `preparer@ledgerline.demo`
   - `reviewer@ledgerline.demo`
   - `admin@ledgerline.demo`

   Set whatever password you like for each; you'll use it to sign in to the web app.

5. **Configure environment variables**

   ```
   cp .env.example apps/api/.env
   cp apps/web/.env.example apps/web/.env
   ```

   Fill in `apps/api/.env` with the values from step 2, plus `OPENAI_API_KEY` if you have
   one. Fill in `apps/web/.env` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from
   the same project.

6. **Run migrations**

   ```
   npm run migrate -w apps/api
   ```

   This alone leaves you with an empty database — accounts, periods, and journal entries are
   entered through the app itself (an admin user can create a client and a fiscal period from
   the header once signed in).

   To load demo data instead (for trying the app or as a reference dataset — not something a
   real client's books should ever start from), run `npm run seed:demo -w apps/api`. This is
   never run automatically by anything in this repo. It creates a demo client (Adepa Traders
   Ltd), a chart of accounts, six fiscal periods (five closed, one open), and around 40 posted
   transactions, and prints the trial balance total, failing loudly if the books don't balance.
   Demo data is real posted ledger data once created: LedgerLine enforces that a posted journal
   entry is immutable (see CLAUDE.md), so seeded entries can never be deleted, only left
   unused — don't run this against a database you intend to use for real bookkeeping.

7. **Run both apps**

   ```
   npm run dev
   ```

   The API listens on `http://localhost:3000`, the web app on `http://localhost:5173` (its
   dev server proxies `/api` to the API — see `apps/web/vite.config.ts`). Sign in with one of
   the three seeded emails.

## Running the tests

```
npm run test -w apps/api              # unit tests — no database required
npm run test:accounting -w apps/api   # accounting correctness suite — requires DATABASE_URL
                                       # and a migrated, seeded database; skips itself otherwise
npm run typecheck -w apps/api
npm run typecheck -w apps/web
```

`test:accounting` is the suite that actually proves the books are right — see
`apps/api/test/accounting/correctness.spec.ts` for what it checks and why.

## Repository layout

See `apps/api/migrations/NOTES.md` for a one-line summary of what each migration does, and
`docs/` for architecture, accounting policy decisions, the AI boundary, cut scope, and a demo
script.
