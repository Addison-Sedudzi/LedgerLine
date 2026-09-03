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

  // A journal entry that has been reversed is still a fact that happened — it was POSTED,
  // it is immutable, and it is never deleted (CLAUDE.md rule 3). The reversing entry only
  // nets it to zero if BOTH entries' lines count in every balance calculation; excluding the
  // original because its status later changed to REVERSED turns "corrected to zero" into
  // "flipped to the opposite balance", which is the bug this method exists to prevent. Only
  // DRAFT is ever excluded (unless includeDrafts is set) — a draft is a proposal, not yet a
  // fact.
  private postedStatusFilter(includeDrafts: boolean): string {
    return includeDrafts ? "je.status IN ('POSTED','REVERSED','DRAFT')" : "je.status IN ('POSTED','REVERSED')";
  }

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
    const statusFilter = this.postedStatusFilter(includeDrafts);
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
    const statusFilter = this.postedStatusFilter(includeDrafts);
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

  // The single source of truth for "what is this account's balance as of this date" —
  // trialBalance() and the Ledger page's per-account balance (ledger.service.ts) both read
  // through this, so the two reports can never disagree about an account's figure the way
  // they used to when the Ledger computed its own balance from only the current period's
  // movements. Every postable account of the client comes back, active or not and whether
  // or not it has any qualifying lines (COALESCE to 0.00), since a deactivated account can
  // still carry a real historical balance that both reports must account for. Index usage:
  // this hits idx_journal_lines_account_id to gather an account's lines and
  // idx_journal_entries_client_date to restrict by client and date, which is why both
  // exist — see apps/api/migrations/006 and 007.
  async accountBalancesAsOf(clientId: string, asAt: string, includeDrafts: boolean): Promise<TrialBalanceAccountRow[]> {
    const statusFilter = this.postedStatusFilter(includeDrafts);
    return this.db.query<TrialBalanceAccountRow>(
      `WITH qualifying_lines AS (
         SELECT jl.account_id, jl.debit, jl.credit
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl.entry_id
         WHERE je.client_id = $1 AND ${statusFilter} AND je.entry_date <= $2
       )
       SELECT
         a.id AS account_id, a.code, a.name, a.type, a.normal_balance,
         (CASE WHEN a.normal_balance = 'DEBIT' THEN COALESCE(SUM(ql.debit), 0) - COALESCE(SUM(ql.credit), 0)
               ELSE COALESCE(SUM(ql.credit), 0) - COALESCE(SUM(ql.debit), 0) END)::numeric(18,2)::text AS balance
       FROM accounts a
       LEFT JOIN qualifying_lines ql ON ql.account_id = a.id
       WHERE a.client_id = $1 AND a.is_postable = true
       GROUP BY a.id, a.code, a.name, a.type, a.normal_balance
       ORDER BY a.code`,
      [clientId, asAt],
    );
  }

  // Trial balance = the shared cumulative balance, restricted to accounts that actually have
  // something to show. Kept as its own method so callers don't repeat the "nonzero" filter.
  async trialBalance(clientId: string, asAt: string, includeDrafts: boolean): Promise<TrialBalanceAccountRow[]> {
    const rows = await this.accountBalancesAsOf(clientId, asAt, includeDrafts);
    return rows.filter((r) => r.balance !== '0.00');
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
       WHERE je.client_id = $1 AND ${this.postedStatusFilter(false)} AND je.entry_date BETWEEN $2 AND $3
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
       WHERE je.client_id = $1 AND jl.account_id = $2 AND ${this.postedStatusFilter(false)}
         AND je.entry_date BETWEEN $3 AND $4
       ORDER BY je.entry_date, je.entry_no, jl.line_no`,
      [clientId, accountId, startDate, endDate],
    );
  }

  // Every posted amount in the period, used by the trial balance diagnostics to test
  // whether an out-of-balance difference matches twice some single posted amount — the
  // signature of an entry posted to the wrong side.
  async postedAmountsUpTo(clientId: string, asAt: string): Promise<string[]> {
    const statusFilter = this.postedStatusFilter(false);
    const rows = await this.db.query<{ amount: string }>(
      `SELECT DISTINCT jl.debit::text AS amount FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       WHERE je.client_id = $1 AND ${statusFilter} AND je.entry_date <= $2 AND jl.debit > 0
       UNION
       SELECT DISTINCT jl.credit::text FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       WHERE je.client_id = $1 AND ${statusFilter} AND je.entry_date <= $2 AND jl.credit > 0`,
      [clientId, asAt],
    );
    return rows.map((r) => r.amount);
  }
}
