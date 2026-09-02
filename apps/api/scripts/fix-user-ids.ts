// One-off repair: the demo seed (scripts/seed.ts) originally generated a random UUID for
// each seeded user's `public.users.id` instead of using their real Supabase Auth id. The
// API trusts `id` to equal the JWT's `sub` claim directly (see migrations/003, AuthGuard),
// so every demo login has been resolving to no user row and silently failing role checks.
//
// This does not touch journal_entries, audit_log, documents or fiscal_periods — those rows
// keep referencing the old id (posted journal entries are immutable, enforced by a database
// trigger, so their created_by/posted_by can never be rewritten). Instead, each old row is
// kept in place under a "+legacy" email so history stays valid, and a new row is inserted
// under the real Supabase Auth id so future logins resolve correctly.
//
// Run once: npm run -w apps/api fix-user-ids
import 'dotenv/config';
import { Client } from 'pg';

const DEMO_EMAILS = ['admin@ledgerline.demo', 'preparer@ledgerline.demo', 'reviewer@ledgerline.demo'];

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set.');

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query('BEGIN');

    const pairs = await client.query<{
      email: string;
      auth_id: string;
      old_id: string;
      full_name: string;
      role: string;
    }>(
      `SELECT au.email, au.id AS auth_id, pu.id AS old_id, pu.full_name, pu.role
       FROM auth.users au JOIN public.users pu ON pu.email = au.email
       WHERE au.email = ANY($1)`,
      [DEMO_EMAILS],
    );

    if (pairs.rows.length === 0) {
      console.log('No matching demo users found in auth.users — nothing to do.');
    }

    for (const row of pairs.rows) {
      if (row.auth_id === row.old_id) {
        console.log(`${row.email} already aligned, skipping.`);
        continue;
      }

      const legacyEmail = row.email.replace('@', '+legacy@');
      console.log(`Fixing ${row.email} (app id ${row.old_id} -> auth id ${row.auth_id})`);

      await client.query('UPDATE users SET email = $1 WHERE id = $2', [legacyEmail, row.old_id]);
      await client.query('INSERT INTO users (id, email, full_name, role) VALUES ($1, $2, $3, $4)', [
        row.auth_id,
        row.email,
        row.full_name,
        row.role,
      ]);
      const linked = await client.query(
        `INSERT INTO client_users (client_id, user_id)
         SELECT client_id, $1 FROM client_users WHERE user_id = $2
         ON CONFLICT DO NOTHING RETURNING client_id`,
        [row.auth_id, row.old_id],
      );
      console.log(`  old row renamed to ${legacyEmail}; new row inserted; client links copied: ${linked.rowCount}`);
    }

    await client.query('COMMIT');
    console.log('Done.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
