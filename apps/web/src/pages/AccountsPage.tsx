import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AccountType } from '@ledgerline/shared';
import { useClientPeriod } from '../context/ClientPeriodContext';
import { listAccounts } from '../api/accounts';
import { queryKeys } from '../api/queryKeys';
import { LedgerTable } from '../components/LedgerTable';

const TYPE_ORDER: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];

export function AccountsPage() {
  const navigate = useNavigate();
  const { clientId } = useClientPeriod();
  const [search, setSearch] = useState('');

  const { data: accounts = [] } = useQuery({
    queryKey: queryKeys.accounts(clientId ?? ''),
    queryFn: () => listAccounts(clientId!),
    enabled: !!clientId,
  });

  const filtered = useMemo(() => {
    if (!search) return accounts;
    const q = search.toLowerCase();
    return accounts.filter((a) => a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q));
  }, [accounts, search]);

  return (
    <div>
      <h2>Chart of accounts</h2>
      <input
        placeholder="Search by code or name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ padding: '6px 8px', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', marginBottom: 'var(--space-4)', width: 300 }}
      />

      {TYPE_ORDER.map((type) => {
        const group = filtered.filter((a) => a.type === type);
        if (group.length === 0) return null;
        return (
          <div key={type} style={{ marginBottom: 'var(--space-5)' }}>
            <h3 style={{ marginBottom: 'var(--space-2)', fontSize: 13, color: 'var(--ink-muted)', textTransform: 'uppercase' }}>
              {type}
            </h3>
            <LedgerTable
              columns={[
                { key: 'code', header: 'Code', render: (a) => <span className="mono">{a.code}</span> },
                { key: 'name', header: 'Name', render: (a) => a.name },
                { key: 'postable', header: 'Postable', render: (a) => (a.isPostable ? 'Yes' : 'No — has sub-accounts') },
                { key: 'active', header: 'Active', render: (a) => (a.isActive ? 'Yes' : 'No') },
              ]}
              rows={group}
              getRowKey={(a) => a.id}
              onRowActivate={(a) => navigate(`/ledger/${a.id}`)}
            />
          </div>
        );
      })}
    </div>
  );
}
