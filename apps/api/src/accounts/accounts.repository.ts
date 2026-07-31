import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { AccountType, NormalBalance } from '@ledgerline/shared';
import { DatabaseService } from '../database/database.service';

export interface AccountRow {
  id: string;
  client_id: string;
  code: string;
  name: string;
  type: AccountType;
  normal_balance: NormalBalance;
  parent_id: string | null;
  is_postable: boolean;
  is_active: boolean;
}

@Injectable()
export class AccountsRepository {
  constructor(private readonly db: DatabaseService) {}

  async findAll(
    clientId: string,
    filters: { type?: AccountType; active?: boolean } = {},
  ): Promise<AccountRow[]> {
    const conditions = ['client_id = $1'];
    const params: unknown[] = [clientId];
    if (filters.type) {
      params.push(filters.type);
      conditions.push(`type = $${params.length}`);
    }
    if (filters.active !== undefined) {
      params.push(filters.active);
      conditions.push(`is_active = $${params.length}`);
    }
    return this.db.query<AccountRow>(
      `SELECT * FROM accounts WHERE ${conditions.join(' AND ')} ORDER BY code`,
      params,
    );
  }

  async findById(clientId: string, id: string): Promise<AccountRow | null> {
    const rows = await this.db.query<AccountRow>(
      'SELECT * FROM accounts WHERE client_id = $1 AND id = $2',
      [clientId, id],
    );
    return rows[0] ?? null;
  }

  async findByCode(clientId: string, code: string): Promise<AccountRow | null> {
    const rows = await this.db.query<AccountRow>(
      'SELECT * FROM accounts WHERE client_id = $1 AND code = $2',
      [clientId, code],
    );
    return rows[0] ?? null;
  }

  async setPostable(clientId: string, id: string, isPostable: boolean): Promise<void> {
    await this.db.query('UPDATE accounts SET is_postable = $3 WHERE client_id = $1 AND id = $2', [
      clientId,
      id,
      isPostable,
    ]);
  }

  async deleteById(clientId: string, id: string): Promise<void> {
    await this.db.query('DELETE FROM accounts WHERE client_id = $1 AND id = $2', [clientId, id]);
  }

  async hasChildren(clientId: string, id: string): Promise<boolean> {
    const rows = await this.db.query('SELECT 1 FROM accounts WHERE client_id = $1 AND parent_id = $2', [
      clientId,
      id,
    ]);
    return rows.length > 0;
  }

  async hasPostings(clientId: string, id: string): Promise<boolean> {
    const rows = await this.db.query(
      `SELECT 1 FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       WHERE je.client_id = $1 AND jl.account_id = $2 LIMIT 1`,
      [clientId, id],
    );
    return rows.length > 0;
  }

  async create(
    clientId: string,
    input: {
      code: string;
      name: string;
      type: AccountType;
      normalBalance: NormalBalance;
      parentId: string | null;
      isPostable: boolean;
    },
  ): Promise<AccountRow> {
    const rows = await this.db.query<AccountRow>(
      `INSERT INTO accounts (client_id, code, name, type, normal_balance, parent_id, is_postable)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [clientId, input.code, input.name, input.type, input.normalBalance, input.parentId, input.isPostable],
    );
    return rows[0];
  }

  async update(
    clientId: string,
    id: string,
    patch: Partial<{ name: string; isActive: boolean }>,
  ): Promise<AccountRow> {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.name !== undefined) {
      params.push(patch.name);
      sets.push(`name = $${params.length}`);
    }
    if (patch.isActive !== undefined) {
      params.push(patch.isActive);
      sets.push(`is_active = $${params.length}`);
    }
    params.push(clientId, id);
    const rows = await this.db.query<AccountRow>(
      `UPDATE accounts SET ${sets.join(', ')}
       WHERE client_id = $${params.length - 1} AND id = $${params.length} RETURNING *`,
      params,
    );
    return rows[0];
  }

  // Balance as at a date, from posted lines only. Draft entries never affect a balance:
  // an unposted figure is a proposal, not a fact, and must never leak into a report.
  async balanceAsAt(
    clientId: string,
    accountId: string,
    asAt: string,
    normalBalance: NormalBalance,
    client?: PoolClient,
  ): Promise<string> {
    const sign = normalBalance === 'DEBIT' ? 'SUM(jl.debit) - SUM(jl.credit)' : 'SUM(jl.credit) - SUM(jl.debit)';
    const runner = client ?? this.db.pool;
    const result = await runner.query(
      `SELECT COALESCE(${sign}, 0)::text AS balance
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       WHERE je.client_id = $1 AND jl.account_id = $2 AND je.status = 'POSTED' AND je.entry_date <= $3`,
      [clientId, accountId, asAt],
    );
    return result.rows[0]?.balance ?? '0.00';
  }
}
