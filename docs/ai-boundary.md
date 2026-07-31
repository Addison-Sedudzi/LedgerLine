# The AI boundary

This is the question a supervisor or examiner will ask first: what does the model actually
do, and how do you know it isn't quietly making accounting decisions?

## What Claude does

- **Extracts.** Given a photo of an invoice or receipt, it reads the supplier, document
  number, date, line items, subtotal, VAT and total, and reports a confidence per field.
  (`ClaudeService.messages` in `apps/api/src/intelligence/claude.service.ts`, called from
  `DocumentsService.extract`.)
- **Classifies.** Given the extracted description and the client's chart of expense
  accounts, it suggests one account and a one-sentence reason. (`DocumentsService.suggestAccount`.)
- **Drafts.** Nothing implemented yet in this build calls Claude to draft prose (the
  pre-close review and narrative commentary features are cut — see `docs/cut-scope.md`) but
  the same rule applies to them when they are built: a draft is text for a human to edit,
  never a figure or a posting.

## What Claude never does

- **Never calculates.** Every amount that reaches the ledger is computed in SQL or in the
  `Money` class (`packages/shared/src/money.ts`), never invented or corrected by the model.
  The extraction prompt explicitly instructs it to report figures exactly as printed, even if
  a total looks wrong.
- **Never posts.** There is no code path from `ClaudeService` to `journal_entries` or
  `journal_lines`. `DocumentsService.approve` calls the same `JournalService.createDraft`
  that a human typing a manual entry calls, and it always creates a **DRAFT**. A reviewer
  posts it afterwards, through the ordinary posting flow, with the ordinary checks.
- **Never bypasses review.** The `documents` table's `status` column is the only route from
  an uploaded file to a journal entry: `UPLOADED → EXTRACTED → APPROVED`, and `APPROVED` is
  only reachable through `DocumentsController.approve`, which requires a human-supplied
  `expenseAccountId`, `paymentAccountId`, `amount` and `entryDate` — the suggestion is a
  pre-filled default, not an automatic action.

## How this is enforced, not just claimed

- `ClaudeService` is the only class in the codebase that imports `@anthropic-ai/sdk`. Search
  for the import to confirm.
- `DocumentsService` depends on `JournalService`, not on the journal repository directly —
  it has no way to write a line even if it wanted to.
- Every approval writes an audit row recording **both** what the model suggested
  (`suggested_account_id`, `suggestion_reason`) and what the human actually chose
  (`chosenAccountId` in the audit `after` field). Comparing the two across the audit log is
  how the model's practical accuracy would be measured, rather than asserted.
- If `ANTHROPIC_API_KEY` is not set, `ClaudeService.isConfigured` is `false` and every
  document-intelligence endpoint returns a clear error rather than crashing the app or
  silently doing nothing — the rest of the system (posting, ledgers, statements) works
  identically with or without the key.

## Degraded mode

Without an API key: uploads still work, but extraction returns
`ANTHROPIC_API_KEY is not configured...` and the document sits at `UPLOADED`. A user can
still key the entry manually from the document inbox screen — the AI is an accelerator, not
a dependency.
