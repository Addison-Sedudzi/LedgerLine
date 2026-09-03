import { FormEvent, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Account, AccountSubtype, AccountType } from '@ledgerline/shared';
import { useAuth } from '../context/AuthContext';
import { useClientPeriod } from '../context/ClientPeriodContext';
import { createAccount, deleteAccount, listAccounts, updateAccount } from '../api/accounts';
import { queryKeys } from '../api/queryKeys';
import { LedgerTable } from '../components/LedgerTable';
import { EmptyState } from '../components/EmptyState';
import { ApiError } from '../api/apiClient';

const TYPE_ORDER: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];

// Mirrors the database's accounts_subtype_matches_type CHECK constraint. Income and equity
// accounts have no subtype in this build, so they get no dropdown at all.
const SUBTYPE_OPTIONS_BY_TYPE: Partial<Record<AccountType, AccountSubtype[]>> = {
  ASSET: ['CURRENT_ASSET', 'NON_CURRENT_ASSET'],
  LIABILITY: ['CURRENT_LIABILITY', 'NON_CURRENT_LIABILITY'],
  EXPENSE: ['COST_OF_SALES', 'OPERATING_EXPENSE'],
};

const SUBTYPE_LABEL: Record<AccountSubtype, string> = {
  CURRENT_ASSET: 'Current asset',
  NON_CURRENT_ASSET: 'Non-current asset',
  CURRENT_LIABILITY: 'Current liability',
  NON_CURRENT_LIABILITY: 'Non-current liability',
  COST_OF_SALES: 'Cost of sales',
  OPERATING_EXPENSE: 'Operating expense',
};

// Code is assigned server-side (AccountsService.nextCode) from the type's numbering block —
// the bookkeeper picks a type and a name, never a code.
function NewAccountForm({ clientId, onDone }: { clientId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<AccountType>('EXPENSE');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => createAccount(clientId, { name, type, description: description || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts(clientId) });
      setName('');
      setDescription('');
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
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}
    >
      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-end' }}>
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
        <label style={{ fontSize: 12, color: 'var(--ink-muted)', flex: 1 }}>
          Name
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ display: 'block', width: '100%', padding: '6px 8px', border: '1px solid var(--rule)', borderRadius: 'var(--radius)' }}
          />
        </label>
        <button
          type="submit"
          disabled={mutation.isPending}
          style={{ padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius)' }}
        >
          Add account
        </button>
      </div>
      <label style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
        Description (optional)
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{ display: 'block', width: '100%', padding: '6px 8px', border: '1px solid var(--rule)', borderRadius: 'var(--radius)' }}
        />
      </label>
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
  const [changingType, setChangingType] = useState<{ id: string; type: AccountType } | null>(null);
  const [updateError, setUpdateError] = useState<{ id: string; message: string } | null>(null);

  const isAdmin = me?.role === 'admin';

  const { data: accounts = [] } = useQuery({
    queryKey: queryKeys.accounts(clientId ?? ''),
    queryFn: () => listAccounts(clientId!),
    enabled: !!clientId,
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; patch: { name?: string; isActive?: boolean; subtype?: AccountSubtype; type?: AccountType } }) =>
      updateAccount(clientId!, input.id, input.patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts(clientId!) });
      setRenaming(null);
      setChangingType(null);
      setUpdateError(null);
    },
    onError: (err, variables) =>
      setUpdateError({ id: variables.id, message: err instanceof ApiError ? err.message : 'Failed to update account' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAccount(clientId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts(clientId!) });
      setUpdateError(null);
    },
    onError: (err, id) =>
      setUpdateError({ id, message: err instanceof ApiError ? err.message : 'Failed to delete account' }),
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

      {isAdmin && showNewForm && (
        <NewAccountForm clientId={clientId!} onDone={() => setShowNewForm(false)} />
      )}

      <input
        placeholder="Search by code or name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ padding: '6px 8px', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', marginBottom: 'var(--space-4)', width: 300 }}
      />

      {accounts.length === 0 && (
        <EmptyState
          title="No accounts yet."
          action={isAdmin ? <span>Use "New account" above to add the first one.</span> : undefined}
        />
      )}

      {accounts.length > 0 && filtered.length === 0 && <EmptyState title="No accounts match your search." />}

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
                {
                  key: 'description',
                  header: 'Description',
                  render: (a) => <span style={{ color: 'var(--ink-muted)' }}>{a.description ?? '—'}</span>,
                },
                {
                  key: 'subtype',
                  header: 'Subtype',
                  render: (a) => {
                    const options = SUBTYPE_OPTIONS_BY_TYPE[a.type];
                    if (!options) return <span style={{ color: 'var(--ink-muted)' }}>—</span>;
                    if (!isAdmin) return a.subtype ? SUBTYPE_LABEL[a.subtype] : '—';
                    return (
                      <select
                        value={a.subtype ?? ''}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          updateMutation.mutate({ id: a.id, patch: { subtype: e.target.value as AccountSubtype } })
                        }
                        style={{ padding: '4px 6px', border: '1px solid var(--rule)', borderRadius: 'var(--radius)' }}
                      >
                        {options.map((s) => (
                          <option key={s} value={s}>
                            {SUBTYPE_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    );
                  },
                },
                { key: 'postable', header: 'Postable', render: (a) => (a.isPostable ? 'Yes' : 'No — has sub-accounts') },
                { key: 'active', header: 'Active', render: (a) => (a.isActive ? 'Yes' : 'No') },
                {
                  key: 'actions',
                  header: '',
                  render: (a) => {
                    if (!isAdmin) return null;

                    if (changingType?.id === a.id) {
                      return (
                        <div>
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              updateMutation.mutate({ id: a.id, patch: { type: changingType.type } });
                            }}
                            onClick={(e) => e.stopPropagation()}
                            style={{ display: 'flex', gap: 4, alignItems: 'center' }}
                          >
                            <select
                              autoFocus
                              value={changingType.type}
                              onChange={(e) => setChangingType({ id: a.id, type: e.target.value as AccountType })}
                              style={{ padding: '2px 6px', border: '1px solid var(--rule)', borderRadius: 'var(--radius)' }}
                            >
                              {TYPE_ORDER.map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                            <button type="submit" disabled={updateMutation.isPending} style={{ padding: '2px 8px' }}>
                              Save
                            </button>
                            <button type="button" onClick={() => setChangingType(null)} style={{ padding: '2px 8px' }}>
                              Cancel
                            </button>
                          </form>
                          {updateError?.id === a.id && (
                            <div style={{ color: 'var(--alarm)', fontSize: 11, marginTop: 4, maxWidth: 220 }}>
                              {updateError.message}
                            </div>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => setRenaming({ id: a.id, name: a.name })}
                            style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, fontSize: 12 }}
                          >
                            Rename
                          </button>
                          <button
                            onClick={() => {
                              setUpdateError(null);
                              setChangingType({ id: a.id, type: a.type });
                            }}
                            title="Only possible while this account has no postings against it"
                            style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, fontSize: 12 }}
                          >
                            Change type
                          </button>
                          <button
                            onClick={() => updateMutation.mutate({ id: a.id, patch: { isActive: !a.isActive } })}
                            style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, fontSize: 12 }}
                          >
                            {a.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            onClick={() => {
                              setUpdateError(null);
                              if (confirm(`Delete "${a.name}"? This only works while the account has no postings and no sub-accounts.`)) {
                                deleteMutation.mutate(a.id);
                              }
                            }}
                            disabled={deleteMutation.isPending}
                            title="Only possible while this account has no postings and no sub-accounts"
                            style={{ background: 'none', border: 'none', color: 'var(--alarm)', cursor: 'pointer', padding: 0, fontSize: 12 }}
                          >
                            Delete
                          </button>
                        </div>
                        {updateError?.id === a.id && (
                          <div style={{ color: 'var(--alarm)', fontSize: 11, marginTop: 4, maxWidth: 220 }}>
                            {updateError.message}
                          </div>
                        )}
                      </div>
                    );
                  },
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
