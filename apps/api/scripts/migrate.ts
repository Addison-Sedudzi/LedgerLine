// Applies pending SQL migrations from apps/api/migrations/, in filename order, and records
// each applied filename in schema_migrations so re-running is a no-op. Plain SQL files, no
// migration framework: the accounting logic (triggers, constraints) should be readable and
// reviewable directly, not generated from an ORM's DSL.
import 'dotenv/config';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const migrationsDir = join(__dirname, '..', 'migrations');

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const client = await pool.connect();
  try {
    // The very first migration creates schema_migrations itself, so this table may not
    // exist yet on a brand new database.
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    const { rows: applied } = await client.query<{ filename: string }>(
      'SELECT filename FROM schema_migrations',
    );
    const appliedSet = new Set(applied.map((r) => r.filename));

    let appliedCount = 0;
    for (const file of files) {
      if (appliedSet.has(file)) continue;

      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      console.log(`Applying ${file}...`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
          [file],
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
      appliedCount += 1;
    }

    if (appliedCount === 0) {
      console.log('No pending migrations. Database is up to date.');
    } else {
      console.log(`Applied ${appliedCount} migration(s).`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
