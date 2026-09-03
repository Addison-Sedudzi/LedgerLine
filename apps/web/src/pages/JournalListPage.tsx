import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { JournalEntryStatus } from '@ledgerline/shared';
import { useClientPeriod } from '../context/ClientPeriodContext';
import { listJournalEntries } from '../api/journal';
import { queryKeys } from '../api/queryKeys';
import { LedgerTable } from '../components/LedgerTable';
import { StatusPill } from '../components/StatusPill';
import { EmptyState } from '../components/EmptyState';
import { formatDate } from '../utils/format';

const STATUS_TONE: Record<JournalEntryStatus, 'neutral' | 'accent' | 'alarm' | 'flag'> = {
  DRAFT: 'flag',
  POSTED: 'accent',
  REVERSED: 'neutral',
};

export function JournalListPage() {
  const navigate = useNavigate();
  const { clientId, periodId, isPeriodClosed } = useClientPeriod();
  const [status, setStatus] = useState<JournalEntryStatus | ''>('');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.journalEntries(clientId ?? '', periodId ?? '', { status, search }),
    queryFn: () => listJournalEntries(clientId!, { periodId: periodId!, status: status || undefined, search: search || undefined }),
    enabled: !!clientId && !!periodId,
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <h2>Journal entries</h2>
        {isPeriodClosed ? (
          <span
            title="This period is closed. No new entries can be raised against it — switch to an open period."
            style={{
              padding: '8px 16px',
              background: 'var(--rule)',
              color: 'var(--ink-muted)',
              borderRadius: 'var(--radius)',
              cursor: 'not-allowed',
            }}
          >
            Raise an entry
          </span>
        ) : (
          <Link
            to="/journal/new"
            style={{ padding: '8px 16px', background: 'var(--accent)', color: '#fff', borderRadius: 'var(--radius)', textDecoration: 'none' }}
          >
            Raise an entry
          </Link>
        )}
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <input
          placeholder="Search narration…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: '6px 8px', border: '1px solid var(--rule)', borderRadius: 'var(--radius)' }}
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as JournalEntryStatus | '')}
          style={{ padding: '6px 8px', border: '1px solid var(--rule)', borderRadius: 'var(--radius)' }}
        >
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="POSTED">Posted</option>
          <option value="REVERSED">Reversed</option>
        </select>
      </div>

      {!isLoading && (data?.rows.length ?? 0) === 0 && (
        <EmptyState
          title="No journal entries yet for this period."
          action={
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              {isPeriodClosed ? (
                <span title="This period is closed." style={{ color: 'var(--ink-muted)' }}>
                  Raise an entry
                </span>
              ) : (
                <Link to="/journal/new">Raise an entry</Link>
              )}
              <span>·</span>
              <Link to="/documents">Go to the document inbox</Link>
            </div>
          }
        />
      )}

      {(data?.rows.length ?? 0) > 0 && (
        <LedgerTable
          columns={[
            { key: 'entryNo', header: 'No.', render: (r) => r.entry_no ?? '—' },
            { key: 'date', header: 'Date', render: (r) => formatDate(r.entry_date) },
            { key: 'narration', header: 'Narration', render: (r) => r.narration },
            { key: 'source', header: 'Source', render: (r) => r.source },
            { key: 'status', header: 'Status', render: (r) => <StatusPill label={r.status} tone={STATUS_TONE[r.status]} /> },
          ]}
          rows={data?.rows ?? []}
          getRowKey={(r) => r.id}
          onRowActivate={(r) => navigate(`/journal/${r.id}`)}
        />
      )}
    </div>
  );
}
