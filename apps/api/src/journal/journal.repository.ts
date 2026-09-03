import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { JournalEntrySource, JournalEntryStatus } from '@ledgerline/shared';
import { DatabaseService } from '../database/database.service';

export interface JournalEntryRow {
  id: string;
  client_id: string;
  period_id: string;
  entry_no: string | null;
  entry_date: string;
  narration: string;
  source: JournalEntrySource;
  status: JournalEntryStatus;
  reverses_entry_id: string | null;
  created_by: string;
  created_at: string;
  posted_by: string | null;
  posted_at: string | null;
}

export interface JournalLineRow {
  id: string;
  entry_id: string;
  line_no: number;
  account_id: string;
  debit: string;
  credit: string;
  description: string | null;
  account_code?: string;
  account_name?: string;
  account_is_active?: boolean;
  account_is_postable?: boolean;
}

export interface JournalLineInput {
  accountId: string;
  debit: string;
  credit: string;
  description: string | null;
}

@Injectable()
export class JournalRepository {
  constructor(private readonly db: DatabaseService) {}

  async insertEntry(
    client: PoolClient,
    input: {
      clientId: string;
      periodId: string;
      entryDate: string;
      narration: string;
      source: JournalEntrySource;
      createdBy: string;
      reversesEntryId?: string | null;
    },
  ): Promise<JournalEntryRow> {
    const result = await client.query<JournalEntryRow>(
      `INSERT INTO journal_entries (client_id, period_id, entry_date, narration, source, created_by, reverses_entry_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        input.clientId,
        input.periodId,
        input.entryDate,
        input.narration,
        input.source,
        input.createdBy,
        input.reversesEntryId ?? null,
      ],
    );
    return result.rows[0];
  }

  async insertLines(client: PoolClient, entryId: string, lines: JournalLineInput[]): Promise<void> {
    let lineNo = 1;
    for (const line of lines) {
      await client.query(
        `INSERT INTO journal_lines (entry_id, line_no, account_id, debit, credit, description)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [entryId, lineNo, line.accountId, line.debit, line.credit, line.description],
      );
      lineNo += 1;
    }
  }

  async replaceLines(client: PoolClient, entryId: string, lines: JournalLineInput[]): Promise<void> {
    await client.query('DELETE FROM journal_lines WHERE entry_id = $1', [entryId]);
    await this.insertLines(client, entryId, lines);
  }

  async findLines(entryId: string, client?: PoolClient): Promise<JournalLineRow[]> {
    const runner = client ?? this.db.pool;
    const result = await runner.query<JournalLineRow>(
      `SELECT jl.*, a.code AS account_code, a.name AS account_name,
              a.is_active AS account_is_active, a.is_postable AS account_is_postable
       FROM journal_lines jl JOIN accounts a ON a.id = jl.account_id
       WHERE jl.entry_id = $1 ORDER BY jl.line_no`,
      [entryId],
    );
    return result.rows;
  }

  async findById(clientId: string, id: string, client?: PoolClient): Promise<JournalEntryRow | null> {
    const runner = client ?? this.db.pool;
    const result = await runner.query<JournalEntryRow>(
      'SELECT * FROM journal_entries WHERE client_id = $1 AND id = $2',
      [clientId, id],
    );
    return result.rows[0] ?? null;
  }

  // Locks the row for the duration of the transaction so two concurrent posts against the
  // same entry (or the same client, for entry number allocation) cannot interleave.
  async lockById(client: PoolClient, clientId: string, id: string): Promise<JournalEntryRow | null> {
    const result = await client.query<JournalEntryRow>(
      'SELECT * FROM journal_entries WHERE client_id = $1 AND id = $2 FOR UPDATE',
      [clientId, id],
    );
    return result.rows[0] ?? null;
  }

  async list(
    clientId: string,
    filters: {
      periodId?: string;
      from?: string;
      to?: string;
      accountId?: string;
      status?: JournalEntryStatus;
      source?: JournalEntrySource;
      search?: string;
      page: number;
      pageSize: number;
    },
  ): Promise<{ rows: JournalEntryRow[]; total: number }> {
    const conditions = ['je.client_id = $1'];
    const params: unknown[] = [clientId];
    const add = (clause: string, value: unknown) => {
      params.push(value);
      conditions.push(clause.replace('?', `$${params.length}`));
    };

    if (filters.periodId) add('je.period_id = ?', filters.periodId);
    if (filters.from) add('je.entry_date >= ?', filters.from);
    if (filters.to) add('je.entry_date <= ?', filters.to);
    if (filters.status) add('je.status = ?', filters.status);
    if (filters.source) add('je.source = ?', filters.source);
    if (filters.search) add('je.narration ILIKE ?', `%${filters.search}%`);
    if (filters.accountId) {
      params.push(filters.accountId);
      conditions.push(
        `EXISTS (SELECT 1 FROM journal_lines jl2 WHERE jl2.entry_id = je.id AND jl2.account_id = $${params.length})`,
      );
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const countResult = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM journal_entries je ${where}`,
      params,
    );

    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;
    const rows = await this.db.query<JournalEntryRow>(
      `SELECT je.* FROM journal_entries je ${where}
       ORDER BY je.entry_date DESC, je.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      [...params, filters.pageSize, (filters.page - 1) * filters.pageSize],
    );

    return { rows, total: Number(countResult[0]?.count ?? 0) };
  }

  async deleteEntry(client: PoolClient, clientId: string, id: string): Promise<void> {
    await client.query('DELETE FROM journal_entries WHERE client_id = $1 AND id = $2', [clientId, id]);
  }

  // The gapless, per-client entry number sequence. An advisory lock keyed on the client id
  // serialises allocation across concurrent transactions so two simultaneous posts cannot
  // both compute the same "next" number — without it, two transactions could both read
  // MAX(entry_no) before either commits and collide. The advisory lock is automatically
  // released at the end of the transaction, so callers do not need to release it themselves.
  //
  // Gaps in an accounting document sequence are themselves a red flag to an auditor: a
  // missing entry number invites the question of what happened to it, so numbers are only
  // ever handed out at the moment of posting, never reserved and later abandoned.
  async nextEntryNo(client: PoolClient, clientId: string): Promise<number> {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [clientId]);
    const result = await client.query<{ next: string }>(
      `SELECT COALESCE(MAX(entry_no), 0) + 1 AS next FROM journal_entries WHERE client_id = $1`,
      [clientId],
    );
    return Number(result.rows[0].next);
  }

  async markPosted(client: PoolClient, id: string, entryNo: number, postedBy: string): Promise<JournalEntryRow> {
    const result = await client.query<JournalEntryRow>(
      `UPDATE journal_entries SET status = 'POSTED', entry_no = $2, posted_by = $3, posted_at = now()
       WHERE id = $1 RETURNING *`,
      [id, entryNo, postedBy],
    );
    return result.rows[0];
  }

  async markReversed(client: PoolClient, id: string): Promise<void> {
    await client.query(`UPDATE journal_entries SET status = 'REVERSED' WHERE id = $1`, [id]);
  }
}
