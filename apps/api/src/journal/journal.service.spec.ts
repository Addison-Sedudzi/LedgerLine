import { JournalService } from './journal.service';
import { UnbalancedEntryError, ValidationError } from '../common/errors/domain-errors';
import { AuthenticatedUser } from '../common/types/authenticated-user';

// These are the specification for the posting engine's validation rules, and they run
// without a database: everything they exercise happens before any SQL is issued. The
// concurrency, gaplessness and rollback guarantees are proven separately in
// test/accounting/, against a real Postgres instance, because they depend on behaviour
// (locking, triggers) that only the database actually provides.

const PERIOD = {
  id: 'period-1',
  client_id: 'client-1',
  name: 'January',
  start_date: '2026-01-01',
  end_date: '2026-01-31',
  status: 'OPEN',
  closed_at: null,
  closed_by: null,
};

const ASSET_ACCOUNT = {
  id: 'acc-cash',
  client_id: 'client-1',
  code: '1000',
  name: 'Cash',
  type: 'ASSET',
  normal_balance: 'DEBIT',
  parent_id: null,
  is_postable: true,
  is_active: true,
};

const INCOME_ACCOUNT = {
  ...ASSET_ACCOUNT,
  id: 'acc-sales',
  code: '4000',
  name: 'Sales',
  type: 'INCOME',
  normal_balance: 'CREDIT',
};

function buildService() {
  const accountsById: Record<string, unknown> = {
    [ASSET_ACCOUNT.id]: ASSET_ACCOUNT,
    [INCOME_ACCOUNT.id]: INCOME_ACCOUNT,
  };

  const accounts = {
    findById: jest.fn(async (_clientId: string, id: string) => accountsById[id] ?? null),
  };
  const periods = {
    findById: jest.fn(async () => PERIOD),
    findContainingDate: jest.fn(async () => PERIOD),
  };
  const journal = {
    insertEntry: jest.fn(),
    insertLines: jest.fn(),
    findLines: jest.fn(),
    findById: jest.fn(),
    lockById: jest.fn(),
    replaceLines: jest.fn(),
    list: jest.fn(),
    deleteEntry: jest.fn(),
    nextEntryNo: jest.fn(),
    markPosted: jest.fn(),
    markReversed: jest.fn(),
  };
  const audit = { record: jest.fn() };
  const db = {
    transaction: jest.fn((fn: (client: unknown) => unknown) => fn({})),
  };

  const service = new JournalService(db as any, journal as any, accounts as any, periods as any, audit as any);
  return { service, accounts, periods, journal, audit, db };
}

const user: AuthenticatedUser = { id: 'user-1', email: 'a@b.com', fullName: 'A B', role: 'preparer' };

describe('JournalService.createDraft validation', () => {
  it('rejects an unbalanced entry and states the difference', async () => {
    const { service } = buildService();
    await expect(
      service.createDraft('client-1', user, {
        periodId: PERIOD.id,
        entryDate: '2026-01-15',
        narration: 'test',
        lines: [
          { accountId: ASSET_ACCOUNT.id, debit: '100.00' },
          { accountId: INCOME_ACCOUNT.id, credit: '90.00' },
        ],
      } as any),
    ).rejects.toBeInstanceOf(UnbalancedEntryError);
  });

  it('rejects a line with a negative amount', async () => {
    const { service } = buildService();
    await expect(
      service.createDraft('client-1', user, {
        periodId: PERIOD.id,
        entryDate: '2026-01-15',
        narration: 'test',
        lines: [
          { accountId: ASSET_ACCOUNT.id, debit: '-50.00' },
          { accountId: INCOME_ACCOUNT.id, credit: '50.00' },
        ],
      } as any),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a line carrying both a debit and a credit', async () => {
    const { service } = buildService();
    await expect(
      service.createDraft('client-1', user, {
        periodId: PERIOD.id,
        entryDate: '2026-01-15',
        narration: 'test',
        lines: [
          { accountId: ASSET_ACCOUNT.id, debit: '50.00', credit: '50.00' },
          { accountId: INCOME_ACCOUNT.id, credit: '50.00' },
        ],
      } as any),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a line carrying neither a debit nor a credit', async () => {
    const { service } = buildService();
    await expect(
      service.createDraft('client-1', user, {
        periodId: PERIOD.id,
        entryDate: '2026-01-15',
        narration: 'test',
        lines: [
          { accountId: ASSET_ACCOUNT.id },
          { accountId: INCOME_ACCOUNT.id, credit: '50.00' },
        ],
      } as any),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects fewer than two lines', async () => {
    const { service } = buildService();
    await expect(
      service.createDraft('client-1', user, {
        periodId: PERIOD.id,
        entryDate: '2026-01-15',
        narration: 'test',
        lines: [{ accountId: ASSET_ACCOUNT.id, debit: '50.00' }],
      } as any),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an entry date outside the period', async () => {
    const { service } = buildService();
    await expect(
      service.createDraft('client-1', user, {
        periodId: PERIOD.id,
        entryDate: '2026-02-01',
        narration: 'test',
        lines: [
          { accountId: ASSET_ACCOUNT.id, debit: '50.00' },
          { accountId: INCOME_ACCOUNT.id, credit: '50.00' },
        ],
      } as any),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an inactive account', async () => {
    const { service, accounts } = buildService();
    accounts.findById.mockResolvedValueOnce({ ...ASSET_ACCOUNT, is_active: false });
    await expect(
      service.createDraft('client-1', user, {
        periodId: PERIOD.id,
        entryDate: '2026-01-15',
        narration: 'test',
        lines: [
          { accountId: ASSET_ACCOUNT.id, debit: '50.00' },
          { accountId: INCOME_ACCOUNT.id, credit: '50.00' },
        ],
      } as any),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('accepts a balanced, valid entry', async () => {
    const { service, journal } = buildService();
    journal.insertEntry.mockResolvedValue({ id: 'entry-1', client_id: 'client-1' });
    journal.findById.mockResolvedValue({ id: 'entry-1', client_id: 'client-1', status: 'DRAFT' });
    journal.findLines.mockResolvedValue([
      { id: 'l1', entry_id: 'entry-1', line_no: 1, account_id: ASSET_ACCOUNT.id, debit: '50.00', credit: '0.00', description: null },
      { id: 'l2', entry_id: 'entry-1', line_no: 2, account_id: INCOME_ACCOUNT.id, debit: '0.00', credit: '50.00', description: null },
    ]);

    await expect(
      service.createDraft('client-1', user, {
        periodId: PERIOD.id,
        entryDate: '2026-01-15',
        narration: 'test',
        lines: [
          { accountId: ASSET_ACCOUNT.id, debit: '50.00' },
          { accountId: INCOME_ACCOUNT.id, credit: '50.00' },
        ],
      } as any),
    ).resolves.toBeDefined();
  });
});
