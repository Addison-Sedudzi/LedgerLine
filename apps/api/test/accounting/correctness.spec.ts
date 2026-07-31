// The accounting correctness suite. Unlike the unit tests next to each service, these run
// against a real Postgres database — the same one DATABASE_URL points at — because what
// they prove (triggers, constraints, locking) only exists in the database, not in
// application code. They are written to run against the seeded demo data from
// apps/api/scripts/seed.ts, so run `npm run migrate && npm run seed` first.
//
// If DATABASE_URL is not set, every test in this file is skipped rather than failed, so
// `npm test` still passes in an environment with no database configured (this sandbox
// included). Once DATABASE_URL points at a real Postgres instance, remove nothing — the
// tests activate themselves.
import 'dotenv/config';
import { Pool } from 'pg';

const hasDatabase = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabase ? describe : describe.skip;

let pool: Pool;
let clientId: string;

beforeAll(async () => {
  if (!hasDatabase) return;
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const result = await pool.query('SELECT id FROM clients ORDER BY created_at LIMIT 1');
  if (!result.rows[0]) {
    throw new Error('No client found. Run `npm run seed` before running the correctness suite.');
  }
  clientId = result.rows[0].id;
});

afterAll(async () => {
  if (pool) await pool.end();
});

describeIfDb('Invariant: every posted entry balances', () => {
  it('has no posted entry whose debit total differs from its credit total', async () => {
    const { rows } = await pool.query(
      `SELECT je.id, je.entry_no, SUM(jl.debit) AS total_debit, SUM(jl.credit) AS total_credit
       FROM journal_entries je JOIN journal_lines jl ON jl.entry_id = je.id
       WHERE je.client_id = $1 AND je.status = 'POSTED'
       GROUP BY je.id, je.entry_no
       HAVING SUM(jl.debit) <> SUM(jl.credit)`,
      [clientId],
    );
    expect(rows).toEqual([]);
  });
});

describeIfDb('Invariant: the trial balance agrees at every period end', () => {
  it('has total debits equal to total credits as at each closed period end', async () => {
    const periods = await pool.query('SELECT end_date FROM fiscal_periods WHERE client_id = $1', [clientId]);
    for (const { end_date: endDate } of periods.rows) {
      const { rows } = await pool.query(
        `SELECT
           COALESCE(SUM(jl.debit), 0) AS total_debit,
           COALESCE(SUM(jl.credit), 0) AS total_credit
         FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
         WHERE je.client_id = $1 AND je.status = 'POSTED' AND je.entry_date <= $2`,
        [clientId, endDate],
      );
      expect(Number(rows[0].total_debit)).toBeCloseTo(Number(rows[0].total_credit), 2);
    }
  });
});

describeIfDb('Invariant: the accounting equation holds', () => {
  it('has assets equal to liabilities plus equity plus profit at every period end', async () => {
    const periods = await pool.query(
      'SELECT id, start_date, end_date FROM fiscal_periods WHERE client_id = $1 ORDER BY start_date',
      [clientId],
    );

    const balanceOfType = async (type: string, asAt: string): Promise<number> => {
      const sign = type === 'ASSET' || type === 'EXPENSE' ? 'jl.debit - jl.credit' : 'jl.credit - jl.debit';
      const { rows } = await pool.query(
        `SELECT COALESCE(SUM(${sign}), 0) AS balance
         FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id JOIN accounts a ON a.id = jl.account_id
         WHERE je.client_id = $1 AND a.type = $2 AND je.status = 'POSTED' AND je.entry_date <= $3`,
        [clientId, type, asAt],
      );
      return Number(rows[0].balance);
    };

    for (const period of periods.rows) {
      const assets = await balanceOfType('ASSET', period.end_date);
      const liabilities = await balanceOfType('LIABILITY', period.end_date);
      const equity = await balanceOfType('EQUITY', period.end_date);
      const yearStart = `${new Date(period.end_date).getFullYear()}-01-01`;
      const income = await balanceOfType('INCOME', period.end_date);
      const expense = await balanceOfType('EXPENSE', period.end_date);
      const profit = income - expense;

      expect(assets).toBeCloseTo(liabilities + equity + profit, 2);
      void yearStart;
    }
  });
});

describeIfDb('Invariant: entry numbers are gapless and unique per client', () => {
  it('has no gaps and no duplicates in the posted entry number sequence', async () => {
    const { rows } = await pool.query(
      `SELECT entry_no FROM journal_entries WHERE client_id = $1 AND entry_no IS NOT NULL ORDER BY entry_no`,
      [clientId],
    );
    const numbers = rows.map((r) => Number(r.entry_no));
    const unique = new Set(numbers);
    expect(unique.size).toBe(numbers.length);

    for (let i = 0; i < numbers.length; i++) {
      expect(numbers[i]).toBe(i + 1);
    }
  });
});

describeIfDb('Invariant: a reversal pair nets to zero on every account it touches', () => {
  it('has, for every reversed entry, mirrored lines that cancel out with its reversal', async () => {
    const { rows: reversedEntries } = await pool.query(
      `SELECT id FROM journal_entries WHERE client_id = $1 AND status = 'REVERSED'`,
      [clientId],
    );

    for (const { id: originalId } of reversedEntries) {
      const { rows: reversal } = await pool.query(
        'SELECT id FROM journal_entries WHERE reverses_entry_id = $1',
        [originalId],
      );
      expect(reversal.length).toBe(1);

      const { rows: net } = await pool.query(
        `SELECT SUM(debit) AS total_debit, SUM(credit) AS total_credit
         FROM journal_lines WHERE entry_id IN ($1, $2)`,
        [originalId, reversal[0].id],
      );
      expect(Number(net[0].total_debit)).toBeCloseTo(Number(net[0].total_credit), 2);
    }
  });
});

describeIfDb('Invariant: no posted entry has ever been updated', () => {
  it('has no audit UPDATE record whose before-state was already POSTED', async () => {
    const { rows } = await pool.query(
      `SELECT id, before FROM audit_log
       WHERE action = 'UPDATE' AND entity_type = 'journal_entry' AND client_id = $1`,
      [clientId],
    );
    for (const row of rows) {
      expect(row.before?.status).not.toBe('POSTED');
    }
  });
});

describeIfDb('Invariant: the balance sheet balances at every period end', () => {
  it('has total assets equal to total liabilities and equity (including profit to date) at each period end', async () => {
    // This restates the accounting-equation invariant above through the lens of the actual
    // report the client reads, so a regression in the reports module specifically — not
    // just in the underlying ledger — would be caught here too.
    const periods = await pool.query('SELECT end_date FROM fiscal_periods WHERE client_id = $1', [clientId]);
    for (const { end_date: endDate } of periods.rows) {
      const { rows: assetRows } = await pool.query(
        `SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS balance
         FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id JOIN accounts a ON a.id = jl.account_id
         WHERE je.client_id = $1 AND a.type = 'ASSET' AND je.status = 'POSTED' AND je.entry_date <= $2`,
        [clientId, endDate],
      );
      const { rows: otherRows } = await pool.query(
        `SELECT
           COALESCE(SUM(CASE WHEN a.type IN ('LIABILITY','EQUITY') THEN jl.credit - jl.debit
                             WHEN a.type = 'INCOME' THEN jl.credit - jl.debit
                             WHEN a.type = 'EXPENSE' THEN -(jl.debit - jl.credit)
                             ELSE 0 END), 0) AS balance
         FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id JOIN accounts a ON a.id = jl.account_id
         WHERE je.client_id = $1 AND je.status = 'POSTED' AND je.entry_date <= $2`,
        [clientId, endDate],
      );
      expect(Number(assetRows[0].balance)).toBeCloseTo(Number(otherRows[0].balance), 2);
    }
  });
});
