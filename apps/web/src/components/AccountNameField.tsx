import { KeyboardEvent, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Account, AccountType } from '@ledgerline/shared';
import { findOrCreateAccount } from '../api/accounts';
import { queryKeys } from '../api/queryKeys';
import { ApiError } from '../api/apiClient';

interface AccountNameFieldProps {
  accounts: Account[];
  clientId: string;
  canCreate: boolean;
  accountName: string;
  // Typing: the parent owns the text, this only reports keystrokes. Selecting a suggestion,
  // an exact blur match, or an inline creation sets id and name together in one call.
  onTextChange: (name: string) => void;
  onSelect: (accountId: string, accountName: string) => void;
  onNext?: () => void;
}

// One button per account type; INCOME is labelled "Revenue" here only — the bookkeeper's
// word for it — while the value sent to the API stays the shared AccountType enum.
const TYPE_BUTTONS: { type: AccountType; label: string }[] = [
  { type: 'ASSET', label: 'Asset' },
  { type: 'LIABILITY', label: 'Liability' },
  { type: 'EQUITY', label: 'Equity' },
  { type: 'INCOME', label: 'Revenue' },
  { type: 'EXPENSE', label: 'Expense' },
];

// Free-text, name-only account entry for the journal entry form: no codes shown anywhere.
//
// The input is a plain controlled input bound to `accountName` — never to local state, and
// never re-derived from looking `accountId` up in `accounts`. That lookup-based approach is
// exactly what used to make the text disappear on refocus: focusing reset the component's
// own draft text to '', and the display briefly had nothing to fall back to. Binding
// directly to the line's stored name means there is no code path that can blank it — the
// value shown is always, literally, what the line remembers.
//
// See AccountPicker.tsx for the code-and-name picker still used on the document review
// page, which this intentionally does not replace.
export function AccountNameField({
  accounts,
  clientId,
  canCreate,
  accountName,
  onTextChange,
  onSelect,
  onNext,
}: AccountNameFieldProps) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const filtered = useMemo(() => {
    if (!accountName) return [];
    const q = accountName.toLowerCase();
    return accounts.filter((a) => a.isPostable && a.isActive && a.name.toLowerCase().includes(q));
  }, [accounts, accountName]);

  const commit = (account: Account) => {
    onSelect(account.id, account.name);
    setOpen(false);
    setPendingName(null);
    onNext?.();
  };

  const createMutation = useMutation({
    mutationFn: (type: AccountType) => findOrCreateAccount(clientId, { name: pendingName!, type }),
    onSuccess: (account) => {
      // Written into the shared query cache immediately — every AccountNameField on the
      // page reads the same cached `accounts` array (via the parent's one useQuery), so the
      // new account is available to every other line the instant this resolves, with no
      // page refresh and without waiting on the network round trip below.
      queryClient.setQueryData<Account[]>(queryKeys.accounts(clientId), (old) => (old ? [...old, account] : [account]));
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts(clientId) });
      commit(account);
    },
    onError: (err) => setCreateError(err instanceof ApiError ? err.message : 'Failed to create account'),
  });

  const handleChange = (name: string) => {
    onTextChange(name);
    setHighlighted(0);
    setOpen(true);
  };

  // Nothing was picked from the dropdown — decide whether the current text resolves to an
  // existing account or needs the "new account" prompt. Delayed so a mousedown on a
  // suggestion or a type button registers before this runs.
  const resolveOnBlur = () => {
    setTimeout(() => {
      setOpen(false);
      const typed = accountName.trim();
      if (!typed) {
        setPendingName(null);
        return;
      }
      const exact = accounts.find((a) => a.name.toLowerCase() === typed.toLowerCase());
      if (exact) {
        commit(exact);
      } else {
        setCreateError(null);
        setPendingName(typed);
      }
    }, 150);
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
        value={accountName}
        placeholder="Account name"
        onFocus={() => setOpen(true)}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={resolveOnBlur}
        style={{
          width: '100%',
          padding: '6px 8px',
          border: '1px solid var(--rule)',
          borderRadius: 'var(--radius)',
          fontFamily: 'var(--font-body)',
        }}
      />
      {open && filtered.length > 0 && (
        <ul
          role="listbox"
          style={{
            position: 'absolute',
            zIndex: 20,
            top: '100%',
            left: 0,
            right: 0,
            background: 'var(--paper)',
            border: '1px solid var(--rule)',
            maxHeight: 220,
            overflowY: 'auto',
            margin: 0,
            padding: 0,
            listStyle: 'none',
          }}
        >
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
              }}
            >
              {a.name}
            </li>
          ))}
        </ul>
      )}

      {pendingName && (
        <div
          style={{
            position: 'absolute',
            zIndex: 20,
            top: '100%',
            left: 0,
            right: 0,
            background: 'var(--paper)',
            border: '1px solid var(--rule)',
            padding: 8,
            fontSize: 13,
          }}
        >
          {canCreate ? (
            <>
              <div style={{ marginBottom: 6 }}>New account &ldquo;{pendingName}&rdquo;. Type:</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {TYPE_BUTTONS.map((t) => (
                  <button
                    key={t.type}
                    type="button"
                    disabled={createMutation.isPending}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      createMutation.mutate(t.type);
                    }}
                    style={{
                      padding: '4px 10px',
                      border: '1px solid var(--rule)',
                      background: 'var(--paper)',
                      borderRadius: 'var(--radius)',
                      cursor: 'pointer',
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {createError && <div style={{ color: 'var(--alarm)', marginTop: 6 }}>{createError}</div>}
            </>
          ) : (
            <div style={{ color: 'var(--ink-muted)' }}>
              No account named &ldquo;{pendingName}&rdquo;. Ask an admin to create it.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
