import { CSSProperties, FormEvent, ReactNode, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserRole } from '@ledgerline/shared';
import { useAuth } from '../context/AuthContext';
import { useClientPeriod } from '../context/ClientPeriodContext';
import { createClient } from '../api/me';
import { closePeriod, createPeriod, Period } from '../api/periods';
import { queryKeys } from '../api/queryKeys';
import { ApiError } from '../api/apiClient';
import { PeriodBadge } from './PeriodBadge';

interface NavItem {
  to: string;
  label: string;
  roles?: UserRole[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// Grouped the way an accountant thinks about the work, not the way the code is organised.
// An item with no `roles` is visible to everyone; the audit trail is restricted to
// reviewer/admin server-side (AuditController), so it is hidden rather than shown and
// rejected.
const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Record',
    items: [
      { to: '/journal', label: 'Journal entries' },
      { to: '/documents', label: 'Document inbox' },
    ],
  },
  {
    label: 'Review',
    items: [
      { to: '/ledger', label: 'Ledger' },
      { to: '/audit', label: 'Audit trail', roles: ['reviewer', 'admin'] },
    ],
  },
  {
    label: 'Reports',
    items: [
      { to: '/trial-balance', label: 'Trial balance' },
      { to: '/statements', label: 'Financial statements' },
    ],
  },
  {
    label: 'Setup',
    items: [{ to: '/accounts', label: 'Chart of accounts' }],
  },
];

// Small popover trigger + form shared shape for the two "start fresh" actions below: a
// "+" button that reveals a compact inline form, admin-only since both correspond to
// admin-restricted POST endpoints server-side.
const popoverStyle: CSSProperties = {
  position: 'absolute',
  zIndex: 20,
  top: '100%',
  left: 0,
  marginTop: 4,
  background: 'var(--paper)',
  border: '1px solid var(--rule)',
  borderRadius: 'var(--radius)',
  padding: 8,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  width: 220,
};

function NewClientForm({ onCreated }: { onCreated: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => createClient({ name, businessType: businessType || undefined }),
    onSuccess: (client) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      onCreated(client.id);
      setName('');
      setBusinessType('');
      setOpen(false);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to create client'),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    mutation.mutate();
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="New client"
        style={{ background: 'none', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', padding: '6px 8px', cursor: 'pointer' }}
      >
        + Client
      </button>
      {open && (
        <form onSubmit={handleSubmit} style={popoverStyle}>
          <input
            autoFocus
            required
            placeholder="Client name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ padding: '4px 6px', border: '1px solid var(--rule)', borderRadius: 'var(--radius)' }}
          />
          <input
            placeholder="Business type (optional)"
            value={businessType}
            onChange={(e) => setBusinessType(e.target.value)}
            style={{ padding: '4px 6px', border: '1px solid var(--rule)', borderRadius: 'var(--radius)' }}
          />
          {error && <span style={{ color: 'var(--alarm)', fontSize: 12 }}>{error}</span>}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="submit"
              disabled={mutation.isPending}
              style={{ padding: '4px 10px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius)' }}
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{ padding: '4px 10px', border: '1px solid var(--rule)', background: 'var(--paper)', borderRadius: 'var(--radius)' }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function NewPeriodForm({ clientId, onCreated }: { clientId: string; onCreated: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => createPeriod(clientId, { name, startDate, endDate }),
    onSuccess: (period) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.periods(clientId) });
      onCreated(period.id);
      setName('');
      setStartDate('');
      setEndDate('');
      setOpen(false);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to create period'),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    mutation.mutate();
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="New period"
        style={{ background: 'none', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', padding: '6px 8px', cursor: 'pointer' }}
      >
        + Period
      </button>
      {open && (
        <form onSubmit={handleSubmit} style={popoverStyle}>
          <input
            autoFocus
            required
            placeholder="Period name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ padding: '4px 6px', border: '1px solid var(--rule)', borderRadius: 'var(--radius)' }}
          />
          <label style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
            Start date
            <input
              required
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ display: 'block', width: '100%', padding: '4px 6px', border: '1px solid var(--rule)', borderRadius: 'var(--radius)' }}
            />
          </label>
          <label style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
            End date
            <input
              required
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ display: 'block', width: '100%', padding: '4px 6px', border: '1px solid var(--rule)', borderRadius: 'var(--radius)' }}
            />
          </label>
          {error && <span style={{ color: 'var(--alarm)', fontSize: 12 }}>{error}</span>}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="submit"
              disabled={mutation.isPending}
              style={{ padding: '4px 10px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius)' }}
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{ padding: '4px 10px', border: '1px solid var(--rule)', background: 'var(--paper)', borderRadius: 'var(--radius)' }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// Admin-only, next to the period badge — the OPEN/CLOSED status is a label, never a
// control, so closing a period needs its own explicit action rather than being implied by
// clicking the badge itself.
function ClosePeriodButton({ clientId, period }: { clientId: string; period: Period }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => closePeriod(clientId, period.id),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.periods(clientId) });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to close period'),
  });

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => {
          if (
            confirm(
              `Close period "${period.name}"? Once closed, no postings, draft entries, or account changes to entries in ` +
                'this period can be made. This cannot be undone from here.',
            )
          ) {
            setError(null);
            mutation.mutate();
          }
        }}
        disabled={mutation.isPending}
        title="Lock this period against further postings"
        style={{ background: 'none', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}
      >
        Close period
      </button>
      {error && (
        <div
          style={{
            position: 'absolute',
            zIndex: 20,
            top: '100%',
            left: 0,
            marginTop: 4,
            background: 'var(--paper)',
            border: '1px solid var(--alarm)',
            borderRadius: 'var(--radius)',
            padding: 8,
            fontSize: 12,
            color: 'var(--alarm)',
            width: 260,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

export function Layout(): ReactNode {
  const { me, signOut } = useAuth();
  const { clientId, clients, periodId, periods, period, setClientId, setPeriodId, isPeriodClosed } =
    useClientPeriod();
  const isAdmin = me?.role === 'admin';
  // Only meaningful below the responsive.css breakpoint — at desktop widths the sidebar is
  // always visible via CSS regardless of this, so there's nothing to reset when the window
  // is resized back up.
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="app-shell" style={{ display: 'flex', minHeight: '100vh' }}>
      {navOpen && <div className="app-sidebar-overlay" onClick={() => setNavOpen(false)} />}
      <nav
        className={`no-print app-sidebar${navOpen ? ' open' : ''}`}
        style={{
          width: 220,
          borderRight: '1px solid var(--rule)',
          borderRadius: 0,
          background: 'var(--paper)',
          padding: 'var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-5)',
        }}
      >
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18 }}>LedgerLine</div>
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter((item) => !item.roles || (me && item.roles.includes(me.role)));
          if (visibleItems.length === 0) return null;
          return (
          <div key={group.label}>
            <div style={{ fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
              {group.label}
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {visibleItems.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={() => setNavOpen(false)}
                    style={({ isActive }) => ({
                      display: 'block',
                      padding: '6px 8px',
                      borderRadius: 'var(--radius)',
                      textDecoration: 'none',
                      color: isActive ? 'var(--paper)' : 'var(--ink)',
                      background: isActive ? 'var(--accent)' : 'transparent',
                    })}
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
          );
        })}
        <div style={{ marginTop: 'auto', fontSize: 12, color: 'var(--ink-muted)' }}>
          <div>{me?.fullName}</div>
          <div>{me?.role}</div>
          <button
            onClick={() => signOut()}
            style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0 }}
          >
            Sign out
          </button>
        </div>
      </nav>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header
          className="no-print"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-4)',
            padding: 'var(--space-3) var(--space-4)',
            borderBottom: '1px solid var(--rule)',
          }}
        >
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setNavOpen((o) => !o)}
            aria-label="Toggle navigation menu"
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              border: '1px solid var(--rule)',
              borderRadius: 'var(--radius)',
              background: 'var(--paper)',
              color: 'var(--ink)',
              cursor: 'pointer',
              fontSize: 16,
              flexShrink: 0,
            }}
          >
            ☰
          </button>
          <div className="app-header-controls" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <select
            value={clientId ?? ''}
            onChange={(e) => setClientId(e.target.value)}
            style={{
              padding: '6px 8px',
              border: '1px solid var(--rule)',
              borderRadius: 'var(--radius)',
              background: 'var(--paper)',
              color: 'var(--ink)',
            }}
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id} style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
                {c.name}
              </option>
            ))}
          </select>
          {isAdmin && <NewClientForm onCreated={setClientId} />}

          <select
            value={periodId ?? ''}
            onChange={(e) => setPeriodId(e.target.value)}
            style={{
              padding: '6px 8px',
              border: '1px solid var(--rule)',
              borderRadius: 'var(--radius)',
              background: 'var(--paper)',
              color: 'var(--ink)',
            }}
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id} style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
                {p.name} ({p.status})
              </option>
            ))}
          </select>
          {isAdmin && clientId && <NewPeriodForm clientId={clientId} onCreated={setPeriodId} />}

          {period && <PeriodBadge name={period.name} status={period.status} />}
          {isAdmin && clientId && period && period.status === 'OPEN' && (
            <ClosePeriodButton clientId={clientId} period={period} />
          )}
          </div>
        </header>

        {isPeriodClosed && (
          <div
            style={{
              background: 'color-mix(in srgb, var(--flag) 12%, var(--paper))',
              color: 'var(--flag)',
              padding: 'var(--space-2) var(--space-4)',
              borderBottom: '1px solid var(--rule)',
              fontSize: 13,
            }}
          >
            This period is closed. No postings can be made against it.
          </div>
        )}

        <main style={{ flex: 1, padding: 'var(--space-5)', overflow: 'auto' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
