import { KeyboardEvent, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Account } from '@ledgerline/shared';
import { suggestAccount } from '../api/accounts';
import { queryKeys } from '../api/queryKeys';

interface AccountNameFieldProps {
  accounts: Account[];
  clientId: string;
  accountName: string;
  // The line's description, watched only to drive the debounced "ghost" account
  // suggestion below — never displayed or edited here.
  description: string;
  // Typing: the parent owns the text, this only reports keystrokes. Selecting a suggestion,
  // an exact blur match, or an inline creation sets id and name together in one call.
  onTextChange: (name: string) => void;
  onSelect: (accountId: string, accountName: string) => void;
  onNext?: () => void;
}

const SUGGESTION_DEBOUNCE_MS = 500;

// Account-picking, name-typed entry for the journal entry form. Only an account that
// already exists in the chart of accounts can ever be selected — there is no inline
// creation path here (that used to exist; it let a mistyped or one-off name silently add a
// new account to the chart from inside a journal entry, which is exactly the kind of
// uncontrolled account sprawl the chart of accounts is supposed to prevent). A typed name
// that matches nothing just stays unresolved: the line has no accountId, and the form's own
// validation refuses to submit it.
//
// The input is a plain controlled input bound to `accountName` — never to local state, and
// never re-derived from looking `accountId` up in `accounts`. That lookup-based approach is
// exactly what used to make the text disappear on refocus: focusing reset the component's
// own draft text to '', and the display briefly had nothing to fall back to. Binding
// directly to the line's stored name means there is no code path that can blank it — the
// value shown is always, literally, what the line remembers.
//
// See AccountPicker.tsx for the code-and-name picker still used on the document review page.
export function AccountNameField({
  accounts,
  clientId,
  accountName,
  description,
  onTextChange,
  onSelect,
  onNext,
}: AccountNameFieldProps) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [noMatch, setNoMatch] = useState(false);

  // Debounced separately from React Query's own cache: the debounce controls when a
  // request fires at all (never on every keystroke), and the query key (below) is what
  // gives repeated identical descriptions their caching, backed by the server's own
  // persistent cache keyed the same way.
  const [debouncedDescription, setDebouncedDescription] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedDescription(description.trim()), SUGGESTION_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [description]);

  // Only worth asking once there's a real account left blank and a description with some
  // substance — a one- or two-character fragment is too little to suggest from.
  const suggestionEnabled = !accountName && debouncedDescription.length >= 3;
  const { data: suggestionResult } = useQuery({
    queryKey: queryKeys.accountSuggestion(clientId, debouncedDescription.toLowerCase()),
    queryFn: () => suggestAccount(clientId, debouncedDescription),
    enabled: suggestionEnabled,
    staleTime: 5 * 60 * 1000,
  });
  const suggestion =
    suggestionEnabled && suggestionResult?.accountId
      ? { accountId: suggestionResult.accountId, accountName: suggestionResult.accountName! }
      : null;

  const filtered = useMemo(() => {
    if (!accountName) return [];
    const q = accountName.toLowerCase();
    return accounts.filter((a) => a.isPostable && a.isActive && a.name.toLowerCase().includes(q));
  }, [accounts, accountName]);

  const commit = (account: Account) => {
    onSelect(account.id, account.name);
    setOpen(false);
    setNoMatch(false);
    onNext?.();
  };

  const handleChange = (name: string) => {
    onTextChange(name);
    setHighlighted(0);
    setOpen(true);
    setNoMatch(false);
  };

  // Nothing was picked from the dropdown — decide whether the current text resolves to an
  // existing account (an exact, case-insensitive name match) or just leave it unresolved.
  // Delayed so a mousedown on a suggestion registers before this runs.
  const resolveOnBlur = () => {
    setTimeout(() => {
      setOpen(false);
      const typed = accountName.trim();
      if (!typed) {
        setNoMatch(false);
        return;
      }
      const exact = accounts.find((a) => a.name.toLowerCase() === typed.toLowerCase());
      if (exact) {
        commit(exact);
      } else {
        setNoMatch(true);
      }
    }, 150);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Accepting the ghost suggestion doesn't prevent default — Tab still moves focus to
    // the next field afterward, same as it would have anyway.
    if (e.key === 'Tab' && suggestion) {
      onSelect(suggestion.accountId, suggestion.accountName);
      return;
    }
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
        placeholder={suggestion ? `${suggestion.accountName} (Tab to accept)` : 'Account name'}
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
                display: 'flex',
                gap: 8,
              }}
            >
              <span className="mono" style={{ color: 'var(--ink-muted)' }}>{a.code}</span>
              <span>{a.name}</span>
            </li>
          ))}
        </ul>
      )}

      {noMatch && (
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
            color: 'var(--alarm)',
          }}
        >
          No account named &ldquo;{accountName.trim()}&rdquo; in the chart of accounts. Pick an existing account, or
          ask an admin to add it under Chart of accounts.
        </div>
      )}
    </div>
  );
}
