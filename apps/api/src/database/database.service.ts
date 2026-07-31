import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, types } from 'pg';
import { AppConfigService } from '../config/config.service';

// Postgres OID 1700 is NUMERIC. Without this, node-postgres parses NUMERIC columns as
// JavaScript numbers, which cannot represent every value NUMERIC(18,2) can and silently
// rounds. Every amount in this application must arrive as a string.
types.setTypeParser(1700, (value: string) => value);

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly pool: Pool;

  constructor(config: AppConfigService) {
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
      statement_timeout: 10_000,
    });
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    // pg's own typings require T to extend QueryResultRow (an index-signature object); the
    // repositories in this codebase describe rows with plain interfaces instead, which is
    // more readable than an index signature, so the result is cast back to T at the edge.
    const result = await this.pool.query(sql, params);
    return result.rows as T[];
  }

  // Every ledger write must go through this method. It checks out a dedicated client,
  // starts a transaction, hands the client to the caller so every statement inside fn runs
  // on the same connection, and commits only if fn resolves. Any thrown error rolls the
  // whole transaction back, so a posting can never leave the entry header written without
  // its lines, or vice versa. The client is always released, success or failure.
  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
