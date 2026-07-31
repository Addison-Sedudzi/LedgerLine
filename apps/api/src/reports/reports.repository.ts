import { Injectable } from '@nestjs/common';
import { AccountType } from '@ledgerline/shared';
import { DatabaseService } from '../database/database.service';

export interface AccountBalanceLine {
  account_id: string;
  code: string;
  name: string;
  balance: string;
}

@Injectable()
export class ReportsRepository {
  constructor(private readonly db: DatabaseService) {}

  // Cumulative balance since inception, as at a date — appropriate for balance sheet
  // accounts (asset/liability/equity), whose balances are a point in time fact.
  async balancesByType(clientId: string, type: AccountType, asAt: string): Promise<AccountBalanceLine[]> {
    const sign = type === 'ASSET' ? 'SUM(jl.debit) - SUM(jl.credit)' : 'SUM(jl.credit) - SUM(jl.debit)';
    return this.db.query<AccountBalanceLine>(
      `SELECT a.id AS account_id, a.code, a.name, COALESCE(${sign}, 0)::text AS balance
       FROM accounts a
       LEFT JOIN journal_lines jl ON jl.account_id = a.id
       LEFT JOIN journal_entries je ON je.id = jl.entry_id AND je.status = 'POSTED' AND je.entry_date <= $3
       WHERE a.client_id = $1 AND a.type = $2 AND a.is_postable = true
       GROUP BY a.id, a.code, a.name
       HAVING COALESCE(${sign}, 0) <> 0
       ORDER BY a.code`,
      [clientId, type, asAt],
    );
  }

  // Movement within a date range only — appropriate for income and expense accounts, whose
  // statement is "for the period" rather than "as at a date". This project does not
  // implement the year-end closing entries that would otherwise zero these accounts
  // between periods, so the income statement is built by restricting to the period's own
  // date range rather than by relying on the accounts having been reset to zero.
  async movementByTypeInRange(
    clientId: string,
    type: AccountType,
    from: string,
    to: string,
  ): Promise<AccountBalanceLine[]> {
    const sign = type === 'EXPENSE' ? 'SUM(jl.debit) - SUM(jl.credit)' : 'SUM(jl.credit) - SUM(jl.debit)';
    return this.db.query<AccountBalanceLine>(
      `SELECT a.id AS account_id, a.code, a.name, COALESCE(${sign}, 0)::text AS balance
       FROM accounts a
       JOIN journal_lines jl ON jl.account_id = a.id
       JOIN journal_entries je ON je.id = jl.entry_id
       WHERE a.client_id = $1 AND a.type = $2 AND je.status = 'POSTED'
         AND je.entry_date BETWEEN $3 AND $4
       GROUP BY a.id, a.code, a.name
       HAVING COALESCE(${sign}, 0) <> 0
       ORDER BY a.code`,
      [clientId, type, from, to],
    );
  }
}
