import { Injectable } from '@nestjs/common';
import { AccountSubtype, AccountType } from '@ledgerline/shared';
import { DatabaseService } from '../database/database.service';

export interface AccountBalanceLine {
  account_id: string;
  code: string;
  name: string;
  balance: string;
  subtype: AccountSubtype | null;
}

@Injectable()
export class ReportsRepository {
  constructor(private readonly db: DatabaseService) {}

  // Cumulative balance since inception, as at a date — appropriate for balance sheet
  // accounts (asset/liability/equity), whose balances are a point in time fact.
  //
  // Every postable account of the type is returned, zero-balance ones included — a
  // statement is meant to show every component of the chart of accounts that could hold
  // one, with 0.00 wherever there is genuinely nothing posted, rather than silently
  // dropping the row. An account is only ever absent because it does not exist in the chart
  // at all, never because its balance happens to be zero.
  //
  // Counts REVERSED entries alongside POSTED ones (never DRAFT): a reversed entry was a real
  // posted fact and stays immutable per CLAUDE.md rule 3 — only counting the reversing entry
  // and not the original it reverses would turn a correction back to zero into a phantom
  // balance in the opposite direction. See LedgerRepository.postedStatusFilter.
  async balancesByType(clientId: string, type: AccountType, asAt: string): Promise<AccountBalanceLine[]> {
    const sign = type === 'ASSET' ? 'SUM(jl.debit) - SUM(jl.credit)' : 'SUM(jl.credit) - SUM(jl.debit)';
    return this.db.query<AccountBalanceLine>(
      `SELECT a.id AS account_id, a.code, a.name, a.subtype, COALESCE(${sign}, 0)::numeric(18,2)::text AS balance
       FROM accounts a
       LEFT JOIN journal_lines jl ON jl.account_id = a.id
       LEFT JOIN journal_entries je ON je.id = jl.entry_id AND je.status IN ('POSTED','REVERSED') AND je.entry_date <= $3
       WHERE a.client_id = $1 AND a.type = $2 AND a.is_postable = true
       GROUP BY a.id, a.code, a.name, a.subtype
       ORDER BY a.code`,
      [clientId, type, asAt],
    );
  }

  // Movement within a date range only — appropriate for income and expense accounts, whose
  // statement is "for the period" rather than "as at a date". This project does not
  // implement the year-end closing entries that would otherwise zero these accounts
  // between periods, so the income statement is built by restricting to the period's own
  // date range rather than by relying on the accounts having been reset to zero.
  //
  // Same completeness rule as balancesByType: every postable account of the type comes
  // back, LEFT JOINed so one with no movement this range still shows at 0.00 instead of
  // being omitted.
  async movementByTypeInRange(
    clientId: string,
    type: AccountType,
    from: string,
    to: string,
  ): Promise<AccountBalanceLine[]> {
    const sign = type === 'EXPENSE' ? 'SUM(jl.debit) - SUM(jl.credit)' : 'SUM(jl.credit) - SUM(jl.debit)';
    return this.db.query<AccountBalanceLine>(
      `SELECT a.id AS account_id, a.code, a.name, a.subtype, COALESCE(${sign}, 0)::numeric(18,2)::text AS balance
       FROM accounts a
       LEFT JOIN journal_lines jl ON jl.account_id = a.id
       LEFT JOIN journal_entries je ON je.id = jl.entry_id AND je.status IN ('POSTED','REVERSED')
         AND je.entry_date BETWEEN $3 AND $4
       WHERE a.client_id = $1 AND a.type = $2 AND a.is_postable = true
       GROUP BY a.id, a.code, a.name, a.subtype
       ORDER BY a.code`,
      [clientId, type, from, to],
    );
  }
}
