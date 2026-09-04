import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AccountType, Money } from '@ledgerline/shared';
import { useClientPeriod } from '../context/ClientPeriodContext';
import { getLedgerForPeriod } from '../api/ledger';
import { queryKeys } from '../api/queryKeys';
import { TAccount } from '../components/TAccount';
import { Figure } from '../components/Figure';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { PrintButton, PrintFooter } from '../components/PrintFooter';

const TYPE_ORDER: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];
const TYPE_SECTION_LABEL: Record<AccountType, string> = {
  ASSET: 'Assets',
  LIABILITY: 'Liabilities',
  EQUITY: 'Equity',
  INCOME: 'Revenue',
  EXPENSE: 'Expenses',
};

// Every T-account for the client's selected period, computed live from posted journal
// lines (see LedgerService.ledgerForPeriod on the API) — nothing here is a separate stored
// ledger. Grouping and totals arrive already computed from the backend; this page filters
// and lays them out.
export function LedgerPage() {
  const { clientId, periodId } = useClientPeriod();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<AccountType | ''>('');
  const [showEmpty, setShowEmpty] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.ledgerForPeriod(clientId ?? '', periodId ?? ''),
    queryFn: () => getLedgerForPeriod(clientId!, periodId!),
    enabled: !!clientId && !!periodId,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.accounts.filter((a) => {
      // "No entries" means nothing to show at all — zero movement *and* zero balance. An
      // account can carry a real balance from an earlier period with nothing posted to it
      // this period specifically (Capital, say); that is not an empty account, and hiding
      // it by default previously depended on balance being derived from this period's own
      // lines. It no longer is (see LedgerService.ledgerForPeriod), so this check no longer
      // can be either.
      const hasNothing = a.debitLines.length === 0 && a.creditLines.length === 0 && Money.of(a.balance).isZero();
      if (!showEmpty && hasNothing) return false;
      if (typeFilter && a.type !== typeFilter) return false;
      if (q && !a.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, search, typeFilter, showEmpty]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h2>Ledger</h2>
        <PrintButton />
      </div>

      {data && (
        <p style={{ fontSize: 13, color: 'var(--ink-muted)', marginTop: 0, marginBottom: 'var(--space-3)' }}>
          Total of all debit balances: <Figure value={data.totalDebitBalances} /> · total of all credit balances:{' '}
          <Figure value={data.totalCreditBalances} />
        </p>
      )}
      {data && !data.balanced && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <ErrorState message="Debit and credit balances do not agree — this should never happen if every entry was posted correctly. Check for a draft that was posted with an error, or an entry outside this period's dates." />
        </div>
      )}

      <div
        className="no-print"
        style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}
      >
        <input
          placeholder="Search by account name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: '6px 8px', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', width: 240 }}
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as AccountType | '')}
          style={{ padding: '6px 8px', border: '1px solid var(--rule)', borderRadius: 'var(--radius)' }}
        >
          <option value="">All types</option>
          {TYPE_ORDER.map((t) => (
            <option key={t} value={t}>
              {TYPE_SECTION_LABEL[t]}
            </option>
          ))}
        </select>
        <label style={{ fontSize: 13 }}>
          <input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} /> Show accounts
          with no entries
        </label>
      </div>

      {isLoading && <LoadingState label="Loading ledger…" />}

      {data && filtered.length === 0 && <EmptyState title="No accounts match." />}

      {TYPE_ORDER.map((type) => {
        const group = filtered.filter((a) => a.type === type);
        if (group.length === 0) return null;
        return (
          <div key={type} style={{ marginBottom: 'var(--space-5)' }}>
            <h3 style={{ fontSize: 13, color: 'var(--ink-muted)', textTransform: 'uppercase', marginBottom: 'var(--space-3)' }}>
              {TYPE_SECTION_LABEL[type]}
            </h3>
            {group.map((a) => (
              <TAccount key={a.accountId} account={a} />
            ))}
          </div>
        );
      })}
      <PrintFooter />
    </div>
  );
}
