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

  async findContainingDate(clientId: string, date: string): Promise<PeriodRow | null> {
    const rows = await this.db.query<PeriodRow>(
      'SELECT * FROM fiscal_periods WHERE client_id = $1 AND start_date <= $2 AND end_date >= $2',
      [clientId, date],
    );
    return rows[0] ?? null;
  }
}
