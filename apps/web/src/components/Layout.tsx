import { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { UserRole } from '@ledgerline/shared';
import { useAuth } from '../context/AuthContext';
import { useClientPeriod } from '../context/ClientPeriodContext';
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
    items: [{ to: '/audit', label: 'Audit trail', roles: ['reviewer', 'admin'] }],
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

export function Layout(): ReactNode {
  const { me, signOut } = useAuth();
  const { clientId, clients, periodId, periods, period, setClientId, setPeriodId, isPeriodClosed } =
    useClientPeriod();

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav
        className="no-print"
        style={{
          width: 220,
          borderRight: '1px solid var(--rule)',
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

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
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
          <select
            value={clientId ?? ''}
            onChange={(e) => setClientId(e.target.value)}
            style={{ padding: '6px 8px', border: '1px solid var(--rule)', borderRadius: 'var(--radius)' }}
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={periodId ?? ''}
            onChange={(e) => setPeriodId(e.target.value)}
            style={{ padding: '6px 8px', border: '1px solid var(--rule)', borderRadius: 'var(--radius)' }}
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.status})
              </option>
            ))}
          </select>

          {period && <PeriodBadge name={period.name} status={period.status} />}
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
