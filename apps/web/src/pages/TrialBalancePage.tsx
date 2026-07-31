import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useClientPeriod } from '../context/ClientPeriodContext';
import { getTrialBalance } from '../api/ledger';
import { queryKeys } from '../api/queryKeys';
import { LedgerTable } from '../components/LedgerTable';
import { Figure } from '../components/Figure';
import { DateField } from '../components/DateField';
import { ErrorState } from '../components/ErrorState';
import { PrintButton, PrintFooter } from '../components/PrintFooter';

export function TrialBalancePage() {
  const navigate = useNavigate();
  const { clientId, period } = useClientPeriod();
  const [asAt, setAsAt] = useState(period?.end_date ?? new Date().toISOString().slice(0, 10));
  const [includeDrafts, setIncludeDrafts] = useState(false);

  const { data } = useQuery({
    queryKey: queryKeys.trialBalance(clientId ?? '', asAt, includeDrafts),
    queryFn: () => getTrialBalance(clientId!, asAt, includeDrafts),
    enabled: !!clientId,
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h2>Trial balance</h2>
        <PrintButton />
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-end', marginBottom: 'var(--space-4)' }}>
        <DateField label="As at" value={asAt} onChange={setAsAt} />
        <label className="no-print" style={{ fontSize: 13 }}>
          <input type="checkbox" checked={includeDrafts} onChange={(e) => setIncludeDrafts(e.target.checked)} />{' '}
          Include drafts
        </label>
      </div>

      {includeDrafts && (
        <div style={{ marginBottom: 'var(--space-3)', color: 'var(--flag)', fontSize: 13 }}>
          This trial balance includes unposted draft entries. It is not the final position.
        </div>
      )}

      {data && !data.balanced && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <ErrorState
            message={`The trial balance does not agree. Difference: ${data.difference}.${
              data.diagnostics?.divisibleByNine
                ? ' This difference is divisible by nine, which often indicates a transposition error (e.g. 54 posted as 45).'
                : ''
            }${
              data.diagnostics?.matchesDoublePostedAmount
                ? ' This difference equals exactly twice an amount posted in the period, which often indicates an entry posted to the wrong side.'
                : ''
            }`}
          />
        </div>
      )}

      {data && (
        <LedgerTable
          columns={[
            { key: 'code', header: 'Code', render: (r) => <span className="mono">{r.code}</span> },
            { key: 'name', header: 'Account', render: (r) => r.name },
            { key: 'debit', header: 'Debit', align: 'right', render: (r) => <Figure value={r.debit} /> },
            { key: 'credit', header: 'Credit', align: 'right', render: (r) => <Figure value={r.credit} /> },
          ]}
          rows={data.rows}
          getRowKey={(r) => r.accountId}
          onRowActivate={(r) => navigate(`/ledger/${r.accountId}`)}
          totals={{
            debit: <Figure value={data.totalDebit} />,
            credit: <Figure value={data.totalCredit} />,
          }}
        />
      )}
      <PrintFooter />
    </div>
  );
}
