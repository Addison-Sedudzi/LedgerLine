import { KeyboardEvent, useMemo, useRef, useState } from 'react';
import { Account } from '@ledgerline/shared';

interface AccountPickerProps {
  accounts: Account[];
  value: string | null;
  onChange: (accountId: string) => void;
  onNext?: () => void;
  placeholder?: string;
}

// Opens on typing, filters by code or name, closes on Escape or selection. Built for
// keyboard-only journal entry: Tab arrives here, arrow keys move through the filtered list,
// Enter selects and moves on.
export function AccountPicker({ accounts, value, onChange, onNext, placeholder }: AccountPickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

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
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        style={{
          width: '100%',
          padding: '6px 8px',
          border: '1px solid var(--rule)',
          borderRadius: 'var(--radius)',
          fontFamily: 'var(--font-body)',
        }}
      />
      {open && (
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
        </ul>
      )}
    </div>
  );
}
