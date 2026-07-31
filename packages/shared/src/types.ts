// Domain types shared between apps/api and apps/web. Changing a shape here breaks the
// build on both sides immediately, which is the point of the monorepo.

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';

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
