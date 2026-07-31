import { useQuery } from '@tanstack/react-query';
import { useClientPeriod } from '../context/ClientPeriodContext';
import { apiFetch } from '../api/apiClient';
import { queryKeys } from '../api/queryKeys';
import { LedgerTable } from '../components/LedgerTable';

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
  const { clientId } = useClientPeriod();

  const { data } = useQuery({
    queryKey: queryKeys.audit(clientId ?? '', {}),
    queryFn: () => apiFetch<{ rows: AuditRow[]; total: number }>('/audit', { clientId: clientId! }),
    enabled: !!clientId,
  });

  return (
    <div>
      <h2>Audit trail</h2>
      <LedgerTable
        columns={[
          { key: 'time', header: 'Time', render: (r) => new Date(r.occurred_at).toLocaleString() },
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
