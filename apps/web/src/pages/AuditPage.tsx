import { useQuery } from '@tanstack/react-query';
import { useClientPeriod } from '../context/ClientPeriodContext';
import { apiFetch, ApiError } from '../api/apiClient';
import { queryKeys } from '../api/queryKeys';
import { LedgerTable } from '../components/LedgerTable';
import { ErrorState } from '../components/ErrorState';
import { formatDateTime } from '../utils/format';
import { actionLabel, actorLabel, auditChanges, entityLabel, AuditRow } from '../utils/audit';

function AuditChangeCell({ row }: { row: AuditRow }) {
  const changes = auditChanges(row);

  return (
    <div style={{ fontSize: 12 }}>
      {changes.length === 0 && (
        <span style={{ color: 'var(--ink-muted)' }}>
          {row.action === 'DELETE' ? 'Record removed' : 'No field values changed'}
        </span>
      )}
      {changes.map((change) => (
        <div key={change.label} style={{ marginBottom: 2 }}>
          <span style={{ color: 'var(--ink-muted)' }}>{change.label}:</span>{' '}
          {change.from ? (
            <>
              <span style={{ textDecoration: 'line-through', color: 'var(--ink-muted)' }}>{change.from}</span>
              {' → '}
              <span style={{ fontWeight: 600 }}>{change.to}</span>
            </>
          ) : (
            <span style={{ fontWeight: 600 }}>{change.to}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export function AuditPage() {
  const { clientId, period } = useClientPeriod();

  // period.start_date/end_date come back from GET /periods as whatever the pg driver and
  // JSON.stringify made of a Postgres `date` column — a full timestamp string
  // ("2026-09-30T00:00:00.000Z"), not a plain date. Slicing to the first 10 characters
  // before building "to" is required: appending a time straight onto the raw value once
  // produced a doubly-timestamped, unparseable string that Postgres rejected outright,
  // which is exactly what made this page 500. occurred_at is itself a timestamptz, so "to"
  // still needs pushing to the end of that calendar day, or a bare date compares against
  // midnight UTC and silently drops everything recorded later that same day.
  const from = period?.start_date.slice(0, 10);
  const to = period ? `${period.end_date.slice(0, 10)}T23:59:59.999` : undefined;

  // No period selected yet (e.g. a brand new client with none created) is a real, valid
  // state — the page should still show the client's whole history, not sit disabled
  // forever waiting for a period that may never come.
  const { data, isError, error } = useQuery({
    queryKey: queryKeys.audit(clientId ?? '', { from, to }),
    queryFn: () =>
      apiFetch<{ rows: AuditRow[]; total: number }>(
        `/audit${from && to ? `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` : ''}`,
        { clientId: clientId! },
      ),
    enabled: !!clientId,
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
          { key: 'actor', header: 'Actor', render: (r) => actorLabel(r) },
          { key: 'action', header: 'Action', render: (r) => actionLabel(r.action) },
          { key: 'entity', header: 'Entity', render: (r) => entityLabel(r) },
          {
            key: 'change',
            header: 'What changed',
            render: (r) => <AuditChangeCell row={r} />,
          },
        ]}
        rows={data?.rows ?? []}
        getRowKey={(r) => r.id.toString()}
      />
    </div>
  );
}
