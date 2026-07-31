# Demo script (about 5 minutes)

Assumes the seed data is loaded (`npm run migrate && npm run seed`) and you're signed in as
`reviewer@ledgerline.demo` so posting and reversal controls are visible.

## 1. Show the books already agree (30 seconds)

Go to **Reports → Trial balance**. Point out: figures are right-aligned and monospaced, debit
and credit are separate columns (not colour-coded — colour carries no accounting meaning
here), and the totals row agrees. Say: "This is checked by a database trigger on every
posting, not just computed for display."

## 2. Raise an entry by keyboard (60 seconds)

Go to **Record → Journal entries → Raise an entry**. Without touching the mouse: type an
account code to open the picker, Enter to select, Tab to description, Tab to debit, type an
amount, Tab past credit, Enter to add the next line, repeat for the credit side. Point at the
difference figure at the bottom going to zero as the entry balances. Ctrl+Enter to post
(confirm the dialog). Show the assigned entry number.

## 3. Upload a document and watch Claude read it (90 seconds)

Go to **Record → Document inbox**. Upload a photo of a receipt (a real one, or a printed
sample). It extracts automatically. Open it: point out the confidence label per field, the
suggested expense account with its one-line reason, and the journal entry preview building
live underneath as you'd edit fields. Say: "Nothing here has touched the ledger yet — this is
still just Claude's reading of the document." Click **Approve and create draft entry**, then
show the quiet line at the foot: "Extracted by Claude, reviewed by you."

## 4. Post that draft, then reverse a mistake (45 seconds)

Open the draft entry just created, post it. Then find any other posted entry and click
**Reverse** — show that the original is now marked REVERSED, and the reversal entry links
back to it. Say: "A posted entry can never be edited or deleted — this is enforced by the
database, not just by hiding a button. A mistake is corrected by reversing, which is itself
just another posted entry."

## 5. Financial statements (60 seconds)

Go to **Reports → Financial statements**. Show the income statement, then the balance sheet.
Toggle comparative on. Say: "If the balance sheet didn't balance, this screen would refuse to
render it and point you at the trial balance instead — a wrong statement is worse than no
statement."

## 6. Close on the audit trail (30 seconds)

Go to **Review → Audit trail**. Show that every action just performed — the draft, the post,
the document approval, the reversal — is attributed to a named user with a timestamp and a
before/after state. Say: "This is the answer to 'who put this figure here, and when' — the
first question an auditor asks about any number in the books."
