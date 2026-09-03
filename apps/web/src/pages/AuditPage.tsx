import { useQuery } from '@tanstack/react-query';
import { useClientPeriod } from '../context/ClientPeriodContext';
import { apiFetch, ApiError } from '../api/apiClient';
import { queryKeys } from '../api/queryKeys';
import { LedgerTable } from '../components/LedgerTable';
import { ErrorState } from '../components/ErrorState';
import { formatDateTime } from '../utils/format';

interface AuditRow {
  id: number;
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  before: unknown;
  after: unknown;
  occurred_at: string;
}

export function AuditPage() {
  const { clientId, period } = useClientPeriod();

  // occurred_at is a timestamptz; the period's own dates are plain dates, so "to" is pushed
  // to the end of that calendar day — otherwise a bare date string compares against midnight
  // UTC and silently drops everything recorded later that same day.
  const from = period?.start_date;
  const to = period ? `${period.end_date}T23:59:59.999` : undefined;

  const { data, isError, error } = useQuery({
    queryKey: queryKeys.audit(clientId ?? '', { periodId: period?.id }),
    queryFn: () =>
      apiFetch<{ rows: AuditRow[]; total: number }>(
        `/audit${from && to ? `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` : ''}`,
        { clientId: clientId! },
      ),
    enabled: !!clientId && !!period,
  });

  return (
    <div>
      <h2>Audit trail</h2>
      {isError && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <ErrorState message={error instanceof ApiError ? error.message : 'Failed to load the audit trail'} />
        </div>
      )}
      <LedgerTable
        columns={[
          { key: 'time', header: 'Time', render: (r) => formatDateTime(r.occurred_at) },
          { key: 'actor', header: 'Actor', render: (r) => r.actor_id },
          { key: 'action', header: 'Action', render: (r) => r.action },
          { key: 'entity', header: 'Entity', render: (r) => `${r.entity_type} ${r.entity_id}` },
          {
            key: 'change',
            header: 'Before → after',
            render: (r) => (
              <span style={{ fontSize: 11 }}>
                {r.before ? JSON.stringify(r.before).slice(0, 60) : '—'} → {r.after ? JSON.stringify(r.after).slice(0, 60) : '—'}
              </span>
            ),
          },
        ]}
        rows={data?.rows ?? []}
        getRowKey={(r) => r.id.toString()}
      />
    </div>
  );
}
