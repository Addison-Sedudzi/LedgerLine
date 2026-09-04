import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
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

    // Every column is qualified with the al alias up front so the same WHERE clause can be
    // dropped into both queries below — the row query joins users, and an unqualified
    // column name would be ambiguous there.
    if (filters.clientId) add('al.client_id = ?', filters.clientId);
    if (filters.entityType) add('al.entity_type = ?', filters.entityType);
    if (filters.entityId) add('al.entity_id = ?', filters.entityId);
    if (filters.actorId) add('al.actor_id = ?', filters.actorId);
    if (filters.from) add('al.occurred_at >= ?', filters.from);
    if (filters.to) add('al.occurred_at <= ?', filters.to);

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRows = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM audit_log al ${where}`,
      params,
    );

    // The actor's name comes back alongside the id so the trail reads as "Akosua Admin did
    // X" rather than as a UUID. LEFT JOIN, not JOIN: the audit log is append-only and
    // outlives everything it references, so a row whose actor no longer exists must still
    // be returned — losing the record of an action because the person who did it was
    // removed would defeat the point of keeping it.
    const limitParamIndex = params.length + 1;
    const offsetParamIndex = params.length + 2;
    const rows = await this.db.query(
      `SELECT al.*, u.full_name AS actor_name, u.email AS actor_email
       FROM audit_log al
       LEFT JOIN users u ON u.id = al.actor_id
       ${where}
       ORDER BY al.occurred_at DESC LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}`,
      [...params, filters.pageSize, (filters.page - 1) * filters.pageSize],
    );

    return { rows, total: Number(countRows[0]?.count ?? 0) };
  }
}
