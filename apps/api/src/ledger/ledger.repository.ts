import { Injectable } from '@nestjs/common';
import { AccountType, NormalBalance } from '@ledgerline/shared';
import { DatabaseService } from '../database/database.service';

export interface GeneralLedgerRow {
  entry_id: string;
  entry_date: string;
  entry_no: string | null;
  narration: string;
  contra_account: string | null;
  debit: string;
  credit: string;
  running_balance: string;
}

export interface TrialBalanceAccountRow {
  account_id: string;
  code: string;
  name: string;
  type: AccountType;
  normal_balance: NormalBalance;
  balance: string;
}

export interface PeriodLedgerLineRow {
  account_id: string;
  line_no: number;
  entry_id: string;
  entry_date: string;
  entry_no: string | null;
  narration: string;
  description: string | null;
  debit: string;
  credit: string;
}

@Injectable()
export class LedgerRepository {
  constructor(private readonly db: DatabaseService) {}

  // Movement is signed so that it adds positively to the account's own normal balance:
  // for a DEBIT-normal account a debit increases it, for a CREDIT-normal account a credit
  // does. This is what lets a single window function produce a running balance that reads
  // the same way the account's balance is always reported.
  async openingBalance(
    clientId: string,
    accountId: string,
    from: string,
    normalBalance: NormalBalance,
    includeDrafts: boolean,
  ): Promise<string> {
    const sign = normalBalance === 'DEBIT' ? 'SUM(jl.debit) - SUM(jl.credit)' : 'SUM(jl.credit) - SUM(jl.debit)';
    const statusFilter = includeDrafts ? "je.status IN ('POSTED','DRAFT')" : "je.status = 'POSTED'";
    const rows = await this.db.query<{ balance: string }>(
      `SELECT COALESCE(${sign}, 0)::text AS balance
       FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
       WHERE je.client_id = $1 AND jl.account_id = $2 AND ${statusFilter} AND je.entry_date < $3`,
      [clientId, accountId, from],
    );
    return rows[0]?.balance ?? '0.00';
  }

  async generalLedger(
    clientId: string,
    accountId: string,
    from: string,
    to: string,
    normalBalance: NormalBalance,
    opening: string,
    includeDrafts: boolean,
  ): Promise<GeneralLedgerRow[]> {
    const movement = normalBalance === 'DEBIT' ? 'jl.debit - jl.credit' : 'jl.credit - jl.debit';
    const statusFilter = includeDrafts ? "je.status IN ('POSTED','DRAFT')" : "je.status = 'POSTED'";
    return this.db.query<GeneralLedgerRow>(
      `WITH scoped AS (
         SELECT
           je.id AS entry_id, je.entry_date, je.entry_no, je.narration,
           jl.debit, jl.credit,
           (${movement}) AS movement,
           (
             SELECT a2.name FROM journal_lines jl2
             JOIN accounts a2 ON a2.id = jl2.account_id
             WHERE jl2.entry_id = je.id AND jl2.account_id <> jl.account_id
               AND (SELECT COUNT(*) FROM journal_lines jl3 WHERE jl3.entry_id = je.id) = 2
             LIMIT 1
           ) AS contra_account
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl.entry_id
         WHERE je.client_id = $1 AND jl.account_id = $2 AND ${statusFilter}
           AND je.entry_date BETWEEN $3 AND $4
       )
       SELECT
         entry_id, entry_date, entry_no, narration, contra_account,
         debit::text, credit::text,
         ($5::numeric + SUM(movement) OVER (ORDER BY entry_date, entry_no, entry_id))::text AS running_balance
       FROM scoped
       ORDER BY entry_date, entry_no, entry_id`,
      [clientId, accountId, from, to, opening],
    );
  }

  // Only postable accounts with a nonzero balance appear on a trial balance. Index usage:
  // this hits idx_journal_lines_account_id to gather an account's lines and
  // idx_journal_entries_client_date to restrict by client and date, which is why both
  // exist — see apps/api/migrations/006 and 007.
  async trialBalance(clientId: string, asAt: string, includeDrafts: boolean): Promise<TrialBalanceAccountRow[]> {
    const statusFilter = includeDrafts ? "je.status IN ('POSTED','DRAFT')" : "je.status = 'POSTED'";
    return this.db.query<TrialBalanceAccountRow>(
      `SELECT
         a.id AS account_id, a.code, a.name, a.type, a.normal_balance,
         (CASE WHEN a.normal_balance = 'DEBIT' THEN SUM(jl.debit) - SUM(jl.credit)
               ELSE SUM(jl.credit) - SUM(jl.debit) END)::text AS balance
       FROM accounts a
       JOIN journal_lines jl ON jl.account_id = a.id
       JOIN journal_entries je ON je.id = jl.entry_id
       WHERE a.client_id = $1 AND a.is_postable = true AND ${statusFilter} AND je.entry_date <= $2
       GROUP BY a.id, a.code, a.name, a.type, a.normal_balance
       HAVING (CASE WHEN a.normal_balance = 'DEBIT' THEN SUM(jl.debit) - SUM(jl.credit)
                    ELSE SUM(jl.credit) - SUM(jl.debit) END) <> 0
       ORDER BY a.code`,
      [clientId, asAt],
    );
  }

  // Every posted line for every account of this client within a date range, flat — one row
  // per journal_lines row, not grouped. The Ledger page groups these into T-accounts per
  // account in the service, per CLAUDE.md's map-at-the-boundary convention; this is the one
  // query it groups from, so every account's page is built from a single round trip.
  async ledgerLinesForPeriod(clientId: string, startDate: string, endDate: string): Promise<PeriodLedgerLineRow[]> {
    return this.db.query<PeriodLedgerLineRow>(
      `SELECT
         jl.account_id, jl.line_no, je.id AS entry_id, je.entry_date, je.entry_no, je.narration,
         jl.description, jl.debit::text, jl.credit::text
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       WHERE je.client_id = $1 AND je.status = 'POSTED' AND je.entry_date BETWEEN $2 AND $3
       ORDER BY je.entry_date, je.entry_no, jl.line_no`,
      [clientId, startDate, endDate],
    );
  }

  // Same as ledgerLinesForPeriod but scoped to one account, for GET /ledger/:accountId — no
  // reason to pull every other account's lines just to filter them back out afterward.
  async ledgerLinesForAccountInPeriod(
    clientId: string,
    accountId: string,
    startDate: string,
    endDate: string,
  ): Promise<PeriodLedgerLineRow[]> {
    return this.db.query<PeriodLedgerLineRow>(
      `SELECT
         jl.account_id, jl.line_no, je.id AS entry_id, je.entry_date, je.entry_no, je.narration,
         jl.description, jl.debit::text, jl.credit::text
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       WHERE je.client_id = $1 AND jl.account_id = $2 AND je.status = 'POSTED'
         AND je.entry_date BETWEEN $3 AND $4
       ORDER BY je.entry_date, je.entry_no, jl.line_no`,
      [clientId, accountId, startDate, endDate],
    );
  }

  // Every posted amount in the period, used by the trial balance diagnostics to test
  // whether an out-of-balance difference matches twice some single posted amount — the
  // signature of an entry posted to the wrong side.
  async postedAmountsUpTo(clientId: string, asAt: string): Promise<string[]> {
    const rows = await this.db.query<{ amount: string }>(
      `SELECT DISTINCT jl.debit::text AS amount FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       WHERE je.client_id = $1 AND je.status = 'POSTED' AND je.entry_date <= $2 AND jl.debit > 0
       UNION
       SELECT DISTINCT jl.credit::text FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       WHERE je.client_id = $1 AND je.status = 'POSTED' AND je.entry_date <= $2 AND jl.credit > 0`,
      [clientId, asAt],
    );
    return rows.map((r) => r.amount);
  }
}
