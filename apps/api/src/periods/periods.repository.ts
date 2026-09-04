import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { PeriodStatus } from '@ledgerline/shared';
import { DatabaseService } from '../database/database.service';

export interface PeriodRow {
  id: string;
  client_id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: PeriodStatus;
  closed_at: string | null;
  closed_by: string | null;
}

@Injectable()
export class PeriodsRepository {
  constructor(private readonly db: DatabaseService) {}

  async findAll(clientId: string): Promise<PeriodRow[]> {
    return this.db.query<PeriodRow>(
      'SELECT * FROM fiscal_periods WHERE client_id = $1 ORDER BY start_date',
      [clientId],
    );
  }

  async findById(clientId: string, id: string, client?: PoolClient): Promise<PeriodRow | null> {
    const runner = client ?? this.db.pool;
    const result = await runner.query('SELECT * FROM fiscal_periods WHERE client_id = $1 AND id = $2', [
      clientId,
      id,
    ]);
    return result.rows[0] ?? null;
  }

  async findContainingDate(clientId: string, date: string, client?: PoolClient): Promise<PeriodRow | null> {
    const runner = client ?? this.db.pool;
    const result = await runner.query(
      'SELECT * FROM fiscal_periods WHERE client_id = $1 AND start_date <= $2 AND end_date >= $2',
      [clientId, date],
    );
    return result.rows[0] ?? null;
  }

  async findByStartDate(clientId: string, startDate: string): Promise<PeriodRow | null> {
    const rows = await this.db.query<PeriodRow>(
      'SELECT * FROM fiscal_periods WHERE client_id = $1 AND start_date = $2',
      [clientId, startDate],
    );
    return rows[0] ?? null;
  }

  // Status is always OPEN on creation — closing a period is a separate, deliberate action,
  // never something implied by how a period is set up.
  async create(
    clientId: string,
    input: { name: string; startDate: string; endDate: string },
  ): Promise<PeriodRow> {
    const rows = await this.db.query<PeriodRow>(
      `INSERT INTO fiscal_periods (client_id, name, start_date, end_date, status)
       VALUES ($1, $2, $3, $4, 'OPEN') RETURNING *`,
      [clientId, input.name, input.startDate, input.endDate],
    );
    return rows[0];
  }

  // A period can't be closed while it still has drafts sitting in it — once closed, a draft
  // can no longer be posted, edited, or deleted (a closed period rejects all writes, see
  // JournalService.validateAndBuildLines/remove), so a draft trapped inside a closed period
  // would be permanently stuck. The bookkeeper must post or delete each one first. Queries
  // journal_entries directly, the same way AccountsRepository.hasPostings queries
  // journal_lines directly, rather than depending on JournalModule (which itself depends on
  // PeriodsModule) and risking a circular module dependency for one boolean check.
  async hasDraftEntries(clientId: string, periodId: string): Promise<boolean> {
    const rows = await this.db.query(
      `SELECT 1 FROM journal_entries WHERE client_id = $1 AND period_id = $2 AND status = 'DRAFT' LIMIT 1`,
      [clientId, periodId],
    );
    return rows.length > 0;
  }

  async close(clientId: string, id: string, closedBy: string, client?: PoolClient): Promise<PeriodRow> {
    const runner = client ?? this.db.pool;
    const result = await runner.query(
      `UPDATE fiscal_periods SET status = 'CLOSED', closed_at = now(), closed_by = $3
       WHERE client_id = $1 AND id = $2 RETURNING *`,
      [clientId, id, closedBy],
    );
    return result.rows[0];
  }
}
