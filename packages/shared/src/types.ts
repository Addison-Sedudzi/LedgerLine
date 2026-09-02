// Domain types shared between apps/api and apps/web. Changing a shape here breaks the
// build on both sides immediately, which is the point of the monorepo.

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';

// Sub-classification within a type, used to build financial statement sections. Nullable —
// income and equity accounts don't use it in this build.
export type AccountSubtype =
  | 'CURRENT_ASSET'
  | 'NON_CURRENT_ASSET'
  | 'CURRENT_LIABILITY'
  | 'NON_CURRENT_LIABILITY'
  | 'COST_OF_SALES'
  | 'OPERATING_EXPENSE';

export type NormalBalance = 'DEBIT' | 'CREDIT';

export type PeriodStatus = 'OPEN' | 'CLOSED';

export type JournalEntryStatus = 'DRAFT' | 'POSTED' | 'REVERSED';

export type JournalEntrySource =
  | 'MANUAL'
  | 'SALES'
  | 'PURCHASE'
  | 'CASH'
  | 'ADJUSTMENT'
  | 'CLOSING'
  | 'DOCUMENT';

export type UserRole = 'preparer' | 'reviewer' | 'admin';

export type DocumentStatus = 'UPLOADED' | 'EXTRACTED' | 'EXTRACTION_FAILED' | 'APPROVED' | 'REJECTED';

export type Confidence = 'high' | 'medium' | 'low';

// The wire representation of an amount: a decimal string end to end, never a JavaScript
// number. Floats cannot represent every value NUMERIC(18,2) can, and a ledger cannot round.
// The Money class in ./money.ts is the arithmetic type used to operate on these safely.
export type MoneyAmount = string;

export interface Account {
  id: string;
  clientId: string;
  code: string;
  name: string;
  type: AccountType;
  normalBalance: NormalBalance;
  parentId: string | null;
  isPostable: boolean;
  isActive: boolean;
  description: string | null;
  subtype: AccountSubtype | null;
}

export interface JournalLine {
  id: string;
  entryId: string;
  lineNo: number;
  accountId: string;
  accountCode?: string;
  accountName?: string;
  debit: MoneyAmount;
  credit: MoneyAmount;
  description: string | null;
}

export interface JournalEntry {
  id: string;
  clientId: string;
  periodId: string;
  entryNo: number | null;
  entryDate: string;
  narration: string;
  source: JournalEntrySource;
  status: JournalEntryStatus;
  reversesEntryId: string | null;
  createdBy: string;
  createdAt: string;
  postedBy: string | null;
  postedAt: string | null;
  lines: JournalLine[];
}

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  debit: MoneyAmount;
  credit: MoneyAmount;
}

export interface TrialBalanceResponse {
  asAt: string;
  includesDrafts: boolean;
  rows: TrialBalanceRow[];
  totalDebit: MoneyAmount;
  totalCredit: MoneyAmount;
  balanced: boolean;
  difference: MoneyAmount;
  diagnostics?: {
    divisibleByNine: boolean;
    matchesDoublePostedAmount: boolean;
  };
}

// One row on one side of a T-account: a single journal line, with enough of its parent
// entry's detail (date, narration, entry number) to display and to link back to /journal/:id.
export interface LedgerLine {
  entryId: string;
  lineNo: number;
  entryDate: string;
  entryNo: number | null;
  narration: string;
  description: string | null;
  amount: MoneyAmount;
}

// A single account's T-account for a period: both sides' lines, both sides' totals, and the
// balancing figure. balanceSide/isAbnormalBalance are derived from the sign of the balance
// against the account's own normalBalance — the same convention trialBalance() uses, so the
// two views can never compute a balance differently for the same account.
export interface AccountLedger {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  debitLines: LedgerLine[];
  creditLines: LedgerLine[];
  totalDebit: MoneyAmount;
  totalCredit: MoneyAmount;
  balance: MoneyAmount;
  balanceSide: NormalBalance;
  isAbnormalBalance: boolean;
}

export interface LedgerResponse {
  periodId: string;
  // Every postable, active account, ordered ASSET/LIABILITY/EQUITY/INCOME/EXPENSE then by
  // code — including ones with no lines this period, so the frontend's "show empty
  // accounts" toggle is a client-side filter, not a second request.
  accounts: AccountLedger[];
  totalDebitBalances: MoneyAmount;
  totalCreditBalances: MoneyAmount;
  balanced: boolean;
}
