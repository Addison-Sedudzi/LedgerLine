import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { AccountSubtype, AccountType, Confidence, NormalBalance } from '@ledgerline/shared';
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
  description: string | null;
  subtype: AccountSubtype | null;
}

export interface SuggestionCacheRow {
  account_id: string | null;
  confidence: Confidence | null;
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

  // Case-insensitive: "Bank" and "bank" are the same account to a bookkeeper typing a name
  // from memory, even though code and name themselves stay case-sensitive everywhere else.
  async findByName(clientId: string, name: string): Promise<AccountRow | null> {
    const rows = await this.db.query<AccountRow>(
      'SELECT * FROM accounts WHERE client_id = $1 AND lower(name) = lower($2)',
      [clientId, name],
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

  async setPostable(clientId: string, id: string, isPostable: boolean, client?: PoolClient): Promise<void> {
    const runner = client ?? this.db.pool;
    await runner.query('UPDATE accounts SET is_postable = $3 WHERE client_id = $1 AND id = $2', [
      clientId,
      id,
      isPostable,
    ]);
  }

  async deleteById(clientId: string, id: string, client?: PoolClient): Promise<void> {
    const runner = client ?? this.db.pool;
    await runner.query('DELETE FROM accounts WHERE client_id = $1 AND id = $2', [clientId, id]);
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
      description: string | null;
      subtype: AccountSubtype | null;
    },
    client?: PoolClient,
  ): Promise<AccountRow> {
    const runner = client ?? this.db.pool;
    const result = await runner.query<AccountRow>(
      `INSERT INTO accounts (client_id, code, name, type, normal_balance, parent_id, is_postable, description, subtype)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        clientId,
        input.code,
        input.name,
        input.type,
        input.normalBalance,
        input.parentId,
        input.isPostable,
        input.description,
        input.subtype,
      ],
    );
    return result.rows[0];
  }

  async update(
    clientId: string,
    id: string,
    patch: Partial<{
      name: string;
      isActive: boolean;
      // null (as opposed to undefined) explicitly clears it — used when a type change
      // moves an account to INCOME/EQUITY, which have no subtype in this build.
      subtype: AccountSubtype | null;
      type: AccountType;
      normalBalance: NormalBalance;
      code: string;
    }>,
    client?: PoolClient,
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
    if (patch.subtype !== undefined) {
      params.push(patch.subtype);
      sets.push(`subtype = $${params.length}`);
    }
    if (patch.type !== undefined) {
      params.push(patch.type);
      sets.push(`type = $${params.length}`);
    }
    if (patch.normalBalance !== undefined) {
      params.push(patch.normalBalance);
      sets.push(`normal_balance = $${params.length}`);
    }
    if (patch.code !== undefined) {
      params.push(patch.code);
      sets.push(`code = $${params.length}`);
    }
    params.push(clientId, id);
    const runner = client ?? this.db.pool;
    const rows = await runner.query<AccountRow>(
      `UPDATE accounts SET ${sets.join(', ')}
       WHERE client_id = $${params.length - 1} AND id = $${params.length} RETURNING *`,
      params,
    );
    return rows.rows[0];
  }

  // Balance as at a date, from posted (and reversed — see LedgerRepository.postedStatusFilter
  // for why) lines only. Draft entries never affect a balance: an unposted figure is a
  // proposal, not a fact, and must never leak into a report.
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
       WHERE je.client_id = $1 AND jl.account_id = $2 AND je.status IN ('POSTED','REVERSED') AND je.entry_date <= $3`,
      [clientId, accountId, asAt],
    );
    return result.rows[0]?.balance ?? '0.00';
  }

  async findCachedSuggestion(clientId: string, descriptionKey: string): Promise<SuggestionCacheRow | null> {
    const rows = await this.db.query<SuggestionCacheRow>(
      'SELECT account_id, confidence FROM account_suggestion_cache WHERE client_id = $1 AND description_key = $2',
      [clientId, descriptionKey],
    );
    return rows[0] ?? null;
  }

  // Upsert: re-suggesting for a description already cached (e.g. after the chart of
  // accounts changed) overwrites rather than duplicates.
  async cacheSuggestion(
    clientId: string,
    descriptionKey: string,
    accountId: string | null,
    confidence: Confidence | null,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO account_suggestion_cache (client_id, description_key, account_id, confidence)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (client_id, description_key)
       DO UPDATE SET account_id = $3, confidence = $4, created_at = now()`,
      [clientId, descriptionKey, accountId, confidence],
    );
  }
}
