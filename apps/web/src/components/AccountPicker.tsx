import { FormEvent, KeyboardEvent, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Account, AccountType } from '@ledgerline/shared';
import { createAccount } from '../api/accounts';
import { queryKeys } from '../api/queryKeys';
import { ApiError } from '../api/apiClient';

interface AccountPickerProps {
  accounts: Account[];
  value: string | null;
  onChange: (accountId: string) => void;
  onNext?: () => void;
  placeholder?: string;
  // Admin-only: lets the user create a new account inline instead of leaving the page.
  // Omit clientId/canCreate to get the plain picker (e.g. on the document review page).
  clientId?: string;
  canCreate?: boolean;
}

const TYPE_ORDER: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];

// Opens on typing, filters by code or name, closes on Escape or selection. Built for
// keyboard-only journal entry: Tab arrives here, arrow keys move through the filtered list,
// Enter selects and moves on.
export function AccountPicker({ accounts, value, onChange, onNext, placeholder, clientId, canCreate }: AccountPickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<AccountType>('EXPENSE');
  const [createError, setCreateError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: () => createAccount(clientId!, { name: newName, type: newType }),
    onSuccess: (account) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts(clientId!) });
      onChange(account.id);
      setNewName('');
      setCreating(false);
      setQuery('');
      setOpen(false);
      onNext?.();
    },
    onError: (err) => setCreateError(err instanceof ApiError ? err.message : 'Failed to create account'),
  });

  const handleCreateSubmit = (e: FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    createMutation.mutate();
  };

  const selected = accounts.find((a) => a.id === value);

  const filtered = useMemo(() => {
    if (!query) return accounts.filter((a) => a.isPostable && a.isActive);
    const q = query.toLowerCase();
    return accounts.filter(
      (a) => a.isPostable && a.isActive && (a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)),
    );
  }, [accounts, query]);

  const commit = (account: Account) => {
    onChange(account.id);
    setQuery('');
    setOpen(false);
    onNext?.();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' && filtered[highlighted]) {
      e.preventDefault();
      commit(filtered[highlighted]);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        value={open ? query : selected ? `${selected.code} — ${selected.name}` : ''}
        placeholder={placeholder ?? 'Account'}
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlighted(0);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => { if (!creating) setOpen(false); }, 120)}
        style={{
          width: '100%',
          padding: '6px 8px',
          border: '1px solid var(--rule)',
          borderRadius: 'var(--radius)',
          fontFamily: 'var(--font-body)',
        }}
      />
      {open && (
        <div
          style={{
            position: 'absolute',
            zIndex: 20,
            top: '100%',
            left: 0,
            right: 0,
            background: 'var(--paper)',
            border: '1px solid var(--rule)',
          }}
        >
          {!creating && (
            <ul
              role="listbox"
              style={{
                maxHeight: 220,
                overflowY: 'auto',
                margin: 0,
                padding: 0,
                listStyle: 'none',
              }}
            >
              {filtered.length === 0 && <li style={{ padding: 8, color: 'var(--ink-muted)' }}>No matching account</li>}
              {filtered.map((a, i) => (
                <li
                  key={a.id}
                  role="option"
                  aria-selected={i === highlighted}
                  onMouseDown={() => commit(a)}
                  style={{
                    padding: '6px 8px',
                    background: i === highlighted ? 'var(--greenbar)' : 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <span className="mono">{a.code}</span>
                  <span>{a.name}</span>
                </li>
              ))}
              {canCreate && clientId && (
                <li
                  onMouseDown={() => {
                    setCreating(true);
                    setNewName(query);
                    setCreateError(null);
                  }}
                  style={{
                    padding: '6px 8px',
                    borderTop: '1px solid var(--rule)',
                    color: 'var(--accent)',
                    cursor: 'pointer',
                  }}
                >
                  + New account
                </li>
              )}
            </ul>
          )}

          {creating && (
            <form onSubmit={handleCreateSubmit} style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                autoFocus
                required
                placeholder="Name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                style={{ padding: '4px 6px', border: '1px solid var(--rule)', borderRadius: 'var(--radius)' }}
              />
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as AccountType)}
                style={{ padding: '4px 6px', border: '1px solid var(--rule)', borderRadius: 'var(--radius)' }}
              >
                {TYPE_ORDER.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {createError && <span style={{ color: 'var(--alarm)', fontSize: 12 }}>{createError}</span>}
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  style={{ padding: '4px 10px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius)' }}
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  style={{ padding: '4px 10px', border: '1px solid var(--rule)', background: 'var(--paper)', borderRadius: 'var(--radius)' }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
