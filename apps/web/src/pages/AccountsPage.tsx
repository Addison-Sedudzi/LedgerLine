import { FormEvent, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Account, AccountType } from '@ledgerline/shared';
import { useAuth } from '../context/AuthContext';
import { useClientPeriod } from '../context/ClientPeriodContext';
import { createAccount, listAccounts, updateAccount } from '../api/accounts';
import { queryKeys } from '../api/queryKeys';
import { LedgerTable } from '../components/LedgerTable';
import { ApiError } from '../api/apiClient';

const TYPE_ORDER: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];

function NewAccountForm({ clientId, onDone }: { clientId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('EXPENSE');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => createAccount(clientId, { code, name, type }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts(clientId) });
      setCode('');
      setName('');
      onDone();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to create account'),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    mutation.mutate();
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-end', marginBottom: 'var(--space-4)' }}
    >
      <label style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
        Code
        <input
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          style={{ display: 'block', padding: '6px 8px', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', width: 100 }}
        />
      </label>
      <label style={{ fontSize: 12, color: 'var(--ink-muted)', flex: 1 }}>
        Name
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ display: 'block', width: '100%', padding: '6px 8px', border: '1px solid var(--rule)', borderRadius: 'var(--radius)' }}
        />
      </label>
      <label style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
        Type
        <select
          value={type}
          onChange={(e) => setType(e.target.value as AccountType)}
          style={{ display: 'block', padding: '6px 8px', border: '1px solid var(--rule)', borderRadius: 'var(--radius)' }}
        >
          {TYPE_ORDER.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={mutation.isPending}
        style={{ padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius)' }}
      >
        Add account
      </button>
      {error && <span style={{ color: 'var(--alarm)', fontSize: 12 }}>{error}</span>}
    </form>
  );
}

export function AccountsPage() {
  const navigate = useNavigate();
  const { me } = useAuth();
  const { clientId } = useClientPeriod();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  const isAdmin = me?.role === 'admin';

  const { data: accounts = [] } = useQuery({
    queryKey: queryKeys.accounts(clientId ?? ''),
    queryFn: () => listAccounts(clientId!),
    enabled: !!clientId,
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; patch: { name?: string; isActive?: boolean } }) =>
      updateAccount(clientId!, input.id, input.patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts(clientId!) });
      setRenaming(null);
    },
  });

  const filtered = useMemo(() => {
    if (!search) return accounts;
    const q = search.toLowerCase();
    return accounts.filter((a) => a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q));
  }, [accounts, search]);

  const renderName = (a: Account) => {
    if (renaming?.id === a.id) {
      return (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateMutation.mutate({ id: a.id, patch: { name: renaming.name } });
          }}
          onClick={(e) => e.stopPropagation()}
          style={{ display: 'flex', gap: 4 }}
        >
          <input
            autoFocus
            value={renaming.name}
            onChange={(e) => setRenaming({ id: a.id, name: e.target.value })}
            style={{ padding: '2px 6px', border: '1px solid var(--rule)', borderRadius: 'var(--radius)' }}
          />
          <button type="submit" style={{ padding: '2px 8px' }}>
            Save
          </button>
          <button type="button" onClick={() => setRenaming(null)} style={{ padding: '2px 8px' }}>
            Cancel
          </button>
        </form>
      );
    }
    return a.name;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <h2>Chart of accounts</h2>
        {isAdmin && (
          <button
            onClick={() => setShowNewForm((s) => !s)}
            style={{ padding: '8px 16px', border: '1px solid var(--rule)', background: 'var(--paper)', borderRadius: 'var(--radius)' }}
          >
            {showNewForm ? 'Cancel' : 'New account'}
          </button>
        )}
      </div>

      {isAdmin && showNewForm && <NewAccountForm clientId={clientId!} onDone={() => setShowNewForm(false)} />}

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
                { key: 'name', header: 'Name', render: renderName },
                { key: 'postable', header: 'Postable', render: (a) => (a.isPostable ? 'Yes' : 'No — has sub-accounts') },
                { key: 'active', header: 'Active', render: (a) => (a.isActive ? 'Yes' : 'No') },
                {
                  key: 'actions',
                  header: '',
                  render: (a) =>
                    isAdmin ? (
                      <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => setRenaming({ id: a.id, name: a.name })}
                          style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, fontSize: 12 }}
                        >
                          Rename
                        </button>
                        <button
                          onClick={() => updateMutation.mutate({ id: a.id, patch: { isActive: !a.isActive } })}
                          style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, fontSize: 12 }}
                        >
                          {a.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    ) : null,
                },
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
