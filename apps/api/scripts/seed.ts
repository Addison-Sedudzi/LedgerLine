// Seeds a demo client with a Ghanaian small-business chart of accounts, a fiscal year of
// periods, and enough posted journal entries to make the reports mean something. Wrapped
// in one transaction and keyed off a fixed client name, so running it twice updates the
// same client rather than duplicating it.
import 'dotenv/config';
import { Pool, PoolClient } from 'pg';
import { randomUUID } from 'crypto';

const CLIENT_NAME = 'Adepa Traders Ltd';

interface SeededAccount {
  id: string;
  code: string;
}

async function upsertClient(client: PoolClient): Promise<string> {
  const existing = await client.query('SELECT id FROM clients WHERE name = $1', [CLIENT_NAME]);
  if (existing.rows[0]) return existing.rows[0].id;
  const result = await client.query(
    'INSERT INTO clients (name, business_type) VALUES ($1, $2) RETURNING id',
    [CLIENT_NAME, 'General trading — Kumasi'],
  );
  return result.rows[0].id;
}

async function upsertUser(
  client: PoolClient,
  email: string,
  fullName: string,
  role: 'preparer' | 'reviewer' | 'admin',
): Promise<string> {
  const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows[0]) return existing.rows[0].id;
  const id = randomUUID();
  await client.query('INSERT INTO users (id, email, full_name, role) VALUES ($1, $2, $3, $4)', [
    id,
    email,
    fullName,
    role,
  ]);
  return id;
}

async function linkClientUser(client: PoolClient, clientId: string, userId: string): Promise<void> {
  await client.query(
    'INSERT INTO client_users (client_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [clientId, userId],
  );
}

async function upsertPeriod(
  client: PoolClient,
  clientId: string,
  name: string,
  start: string,
  end: string,
  status: 'OPEN' | 'CLOSED',
): Promise<string> {
  const existing = await client.query(
    'SELECT id FROM fiscal_periods WHERE client_id = $1 AND start_date = $2',
    [clientId, start],
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const result = await client.query(
    `INSERT INTO fiscal_periods (client_id, name, start_date, end_date, status)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [clientId, name, start, end, status],
  );
  return result.rows[0].id;
}

const CHART: { code: string; name: string; type: string; normal: string; parentCode?: string }[] = [
  { code: '1000', name: 'Cash on hand', type: 'ASSET', normal: 'DEBIT' },
  { code: '1010', name: 'Cash at bank', type: 'ASSET', normal: 'DEBIT' },
  { code: '1020', name: 'Mobile money', type: 'ASSET', normal: 'DEBIT' },
  { code: '1100', name: 'Trade receivables', type: 'ASSET', normal: 'DEBIT' },
  { code: '1200', name: 'Inventory', type: 'ASSET', normal: 'DEBIT' },
  { code: '1300', name: 'Prepayments', type: 'ASSET', normal: 'DEBIT' },
  { code: '1400', name: 'Motor vehicles', type: 'ASSET', normal: 'DEBIT' },
  { code: '1410', name: 'Accumulated depreciation — motor vehicles', type: 'ASSET', normal: 'DEBIT' },
  { code: '1420', name: 'Furniture and fittings', type: 'ASSET', normal: 'DEBIT' },
  { code: '1430', name: 'Accumulated depreciation — furniture', type: 'ASSET', normal: 'DEBIT' },
  { code: '2000', name: 'Trade payables', type: 'LIABILITY', normal: 'CREDIT' },
  { code: '2100', name: 'Accruals', type: 'LIABILITY', normal: 'CREDIT' },
  { code: '2200', name: 'VAT payable', type: 'LIABILITY', normal: 'CREDIT' },
  { code: '3000', name: 'Capital', type: 'EQUITY', normal: 'CREDIT' },
  { code: '3100', name: 'Retained earnings', type: 'EQUITY', normal: 'CREDIT' },
  { code: '3200', name: 'Drawings', type: 'EQUITY', normal: 'CREDIT' },
  { code: '4000', name: 'Sales', type: 'INCOME', normal: 'CREDIT' },
  { code: '4100', name: 'Other income', type: 'INCOME', normal: 'CREDIT' },
  { code: '5000', name: 'Purchases', type: 'EXPENSE', normal: 'DEBIT' },
  { code: '5100', name: 'Rent', type: 'EXPENSE', normal: 'DEBIT' },
  { code: '5200', name: 'Salaries', type: 'EXPENSE', normal: 'DEBIT' },
  { code: '5300', name: 'Utilities', type: 'EXPENSE', normal: 'DEBIT' },
  { code: '5400', name: 'Transport', type: 'EXPENSE', normal: 'DEBIT' },
  { code: '5500', name: 'Repairs', type: 'EXPENSE', normal: 'DEBIT' },
  { code: '5600', name: 'Depreciation expense', type: 'EXPENSE', normal: 'DEBIT' },
  { code: '5700', name: 'Bad debts', type: 'EXPENSE', normal: 'DEBIT' },
  { code: '5800', name: 'Bank charges', type: 'EXPENSE', normal: 'DEBIT' },
  { code: '5900', name: 'Suspense', type: 'ASSET', normal: 'DEBIT' },
];

async function upsertChartOfAccounts(client: PoolClient, clientId: string): Promise<Map<string, SeededAccount>> {
  const byCode = new Map<string, SeededAccount>();
  for (const acc of CHART) {
    const existing = await client.query('SELECT id, code FROM accounts WHERE client_id = $1 AND code = $2', [
      clientId,
      acc.code,
    ]);
    if (existing.rows[0]) {
      byCode.set(acc.code, existing.rows[0]);
      continue;
    }
    const result = await client.query(
      `INSERT INTO accounts (client_id, code, name, type, normal_balance, is_postable)
       VALUES ($1, $2, $3, $4, $5, true) RETURNING id, code`,
      [clientId, acc.code, acc.name, acc.type, acc.normal],
    );
    byCode.set(acc.code, result.rows[0]);
  }
  return byCode;
}

let entryCounter = 0;

async function postEntry(
  client: PoolClient,
  clientId: string,
  periodId: string,
  entryDate: string,
  narration: string,
  lines: { accountId: string; debit?: string; credit?: string }[],
  createdBy: string,
): Promise<void> {
  const entryResult = await client.query(
    `INSERT INTO journal_entries (client_id, period_id, entry_date, narration, source, status, created_by, posted_by, posted_at)
     VALUES ($1, $2, $3, $4, 'MANUAL', 'DRAFT', $5, $5, now()) RETURNING id`,
    [clientId, periodId, entryDate, narration, createdBy],
  );
  const entryId = entryResult.rows[0].id;
  let lineNo = 1;
  for (const line of lines) {
    await client.query(
      `INSERT INTO journal_lines (entry_id, line_no, account_id, debit, credit)
       VALUES ($1, $2, $3, $4, $5)`,
      [entryId, lineNo, line.accountId, line.debit ?? '0', line.credit ?? '0'],
    );
    lineNo += 1;
  }
  entryCounter += 1;
  await client.query(
    `UPDATE journal_entries SET status = 'POSTED', entry_no = $2 WHERE id = $1`,
    [entryId, entryCounter],
  );
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set. Copy .env.example to .env first.');

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const clientId = await upsertClient(client);
    const preparerId = await upsertUser(client, 'preparer@ledgerline.demo', 'Ama Preparer', 'preparer');
    const reviewerId = await upsertUser(client, 'reviewer@ledgerline.demo', 'Kwame Reviewer', 'reviewer');
    const adminId = await upsertUser(client, 'admin@ledgerline.demo', 'Akosua Admin', 'admin');
    await linkClientUser(client, clientId, preparerId);
    await linkClientUser(client, clientId, reviewerId);
    await linkClientUser(client, clientId, adminId);

    // Reset the per-client entry number counter to whatever is already posted, so re-running
    // the seed script does not collide with entry numbers from a prior run.
    const maxEntryNo = await client.query(
      'SELECT COALESCE(MAX(entry_no), 0) AS max FROM journal_entries WHERE client_id = $1',
      [clientId],
    );
    entryCounter = Number(maxEntryNo.rows[0].max);

    const months = [
      ['Jan 2026', '2026-01-01', '2026-01-31', 'CLOSED'],
      ['Feb 2026', '2026-02-01', '2026-02-28', 'CLOSED'],
      ['Mar 2026', '2026-03-01', '2026-03-31', 'CLOSED'],
      ['Apr 2026', '2026-04-01', '2026-04-30', 'CLOSED'],
      ['May 2026', '2026-05-01', '2026-05-31', 'CLOSED'],
      ['Jun 2026', '2026-06-01', '2026-06-30', 'OPEN'],
    ] as const;

    const periodIds: string[] = [];
    for (const [name, start, end, status] of months) {
      periodIds.push(await upsertPeriod(client, clientId, name, start, end, status));
    }

    const accounts = await upsertChartOfAccounts(client, clientId);
    const acc = (code: string) => accounts.get(code)!.id;

    const existingEntries = await client.query(
      'SELECT COUNT(*)::int AS count FROM journal_entries WHERE client_id = $1',
      [clientId],
    );
    if (existingEntries.rows[0].count === 0) {
      // Opening capital.
      await postEntry(
        client,
        clientId,
        periodIds[0],
        '2026-01-01',
        'Opening capital introduced',
        [{ accountId: acc('1010'), debit: '50000.00' }, { accountId: acc('3000'), credit: '50000.00' }],
        adminId,
      );

      for (let m = 0; m < 5; m++) {
        const [, start] = months[m];
        const monthPrefix = start.slice(0, 7);

        for (let i = 0; i < 6; i++) {
          const d = `${monthPrefix}-${String(3 + i * 4).padStart(2, '0')}`;
          const amount = (1200 + i * 137).toFixed(2);
          await postEntry(
            client,
            clientId,
            periodIds[m],
            d,
            `Cash sale to walk-in customer`,
            [{ accountId: acc('1000'), debit: amount }, { accountId: acc('4000'), credit: amount }],
            preparerId,
          );
        }

        for (let i = 0; i < 3; i++) {
          const d = `${monthPrefix}-${String(5 + i * 8).padStart(2, '0')}`;
          const amount = (2400 + i * 260).toFixed(2);
          await postEntry(
            client,
            clientId,
            periodIds[m],
            d,
            `Credit sale, invoice INV-${m}${i}`,
            [{ accountId: acc('1100'), debit: amount }, { accountId: acc('4000'), credit: amount }],
            preparerId,
          );
          const receiptDate = `${monthPrefix}-${String(Math.min(28, 12 + i * 8)).padStart(2, '0')}`;
          await postEntry(
            client,
            clientId,
            periodIds[m],
            receiptDate,
            `Receipt from customer against invoice INV-${m}${i}`,
            [{ accountId: acc('1010'), debit: amount }, { accountId: acc('1100'), credit: amount }],
            preparerId,
          );
        }

        await postEntry(
          client,
          clientId,
          periodIds[m],
          `${monthPrefix}-05`,
          'Purchases on credit from supplier',
          [{ accountId: acc('5000'), debit: '1800.00' }, { accountId: acc('2000'), credit: '1800.00' }],
          preparerId,
        );
        await postEntry(
          client,
          clientId,
          periodIds[m],
          `${monthPrefix}-20`,
          'Payment to supplier',
          [{ accountId: acc('2000'), debit: '1800.00' }, { accountId: acc('1010'), credit: '1800.00' }],
          preparerId,
        );

        await postEntry(
          client,
          clientId,
          periodIds[m],
          `${monthPrefix}-01`,
          'Rent paid for the month',
          [{ accountId: acc('5100'), debit: '900.00' }, { accountId: acc('1010'), credit: '900.00' }],
          preparerId,
        );
        await postEntry(
          client,
          clientId,
          periodIds[m],
          `${monthPrefix}-28`,
          'Salaries paid for the month',
          [{ accountId: acc('5200'), debit: '3200.00' }, { accountId: acc('1010'), credit: '3200.00' }],
          preparerId,
        );
        await postEntry(
          client,
          clientId,
          periodIds[m],
          `${monthPrefix}-15`,
          'Bank charges',
          [{ accountId: acc('5800'), debit: '45.00' }, { accountId: acc('1010'), credit: '45.00' }],
          preparerId,
        );
      }

      console.log(`Seeded ${entryCounter} posted journal entries.`);
    } else {
      console.log('Journal entries already exist for this client; skipping transaction seeding.');
    }

    await client.query('COMMIT');

    const tb = await client.query(
      `SELECT
         COALESCE(SUM(CASE WHEN a.normal_balance = 'DEBIT' THEN jl.debit - jl.credit ELSE 0 END), 0)
           + COALESCE(SUM(CASE WHEN a.normal_balance = 'CREDIT' AND (jl.credit - jl.debit) < 0 THEN jl.debit - jl.credit ELSE 0 END), 0) AS debit_side,
         COALESCE(SUM(jl.debit), 0) AS total_debit,
         COALESCE(SUM(jl.credit), 0) AS total_credit
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       JOIN accounts a ON a.id = jl.account_id
       WHERE je.client_id = $1 AND je.status = 'POSTED'`,
      [clientId],
    );
    const { total_debit: totalDebit, total_credit: totalCredit } = tb.rows[0];
    console.log(`Trial balance check — total debits: ${totalDebit}, total credits: ${totalCredit}`);
    if (Number(totalDebit) !== Number(totalCredit)) {
      throw new Error(`Seed data does not balance! debits=${totalDebit} credits=${totalCredit}`);
    }
    console.log('Seed complete. The books balance.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
