import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'POST'
  | 'REVERSE'
  | 'APPROVE'
  | 'REJECT'
  | 'CLOSE_PERIOD'
  | 'REOPEN_PERIOD'
  | 'LOGIN';

export interface AuditRecordInput {
  actorId: string;
  clientId: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

@Injectable()
export class AuditService {
  constructor(private readonly db: DatabaseService) {}

  // Accepts an optional transaction client so the audit row is written inside the same
  // transaction as the change it describes. If that transaction rolls back, the audit row
  // rolls back with it — there is never a record of a change that did not actually happen.
  async record(input: AuditRecordInput, client?: PoolClient): Promise<void> {
    const runner = client ?? this.db.pool;
    await runner.query(
      `INSERT INTO audit_log (client_id, actor_id, action, entity_type, entity_id, before, after)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.clientId,
        input.actorId,
        input.action,
        input.entityType,
        input.entityId,
        input.before !== undefined ? JSON.stringify(input.before) : null,
        input.after !== undefined ? JSON.stringify(input.after) : null,
      ],
    );
  }

  async list(filters: {
    clientId?: string;
    entityType?: string;
    entityId?: string;
    actorId?: string;
    from?: string;
    to?: string;
    page: number;
    pageSize: number;
  }): Promise<{ rows: Record<string, unknown>[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    const add = (clause: string, value: unknown) => {
      params.push(value);
      conditions.push(clause.replace('?', `$${params.length}`));
    };

    if (filters.clientId) add('client_id = ?', filters.clientId);
    if (filters.entityType) add('entity_type = ?', filters.entityType);
    if (filters.entityId) add('entity_id = ?', filters.entityId);
    if (filters.actorId) add('actor_id = ?', filters.actorId);
    if (filters.from) add('occurred_at >= ?', filters.from);
    if (filters.to) add('occurred_at <= ?', filters.to);

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRows = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM audit_log ${where}`,
      params,
    );

    const limitParamIndex = params.length + 1;
    const offsetParamIndex = params.length + 2;
    const rows = await this.db.query(
      `SELECT * FROM audit_log ${where} ORDER BY occurred_at DESC LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}`,
      [...params, filters.pageSize, (filters.page - 1) * filters.pageSize],
    );

    return { rows, total: Number(countRows[0]?.count ?? 0) };
  }
}
