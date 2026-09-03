import { useMemo, useState } from 'react';
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
import { formatMoney } from '../utils/format';

export function TrialBalancePage() {
  const navigate = useNavigate();
  const { clientId, period, periodId, periods } = useClientPeriod();
  const [asAt, setAsAt] = useState(period?.end_date ?? new Date().toISOString().slice(0, 10));
  const [includeDrafts, setIncludeDrafts] = useState(false);

  // Default From = earliest open period, To = whatever's currently selected in the header.
  // periods is already chronological (PeriodsRepository.findAll orders by start_date).
  const [fromPeriodId, setFromPeriodId] = useState(() => periods.find((p) => p.status === 'OPEN')?.id ?? periods[0]?.id ?? '');
  const [toPeriodId, setToPeriodId] = useState(() => periodId ?? periods[periods.length - 1]?.id ?? '');

  const fromPeriod = periods.find((p) => p.id === fromPeriodId);
  const toPeriod = periods.find((p) => p.id === toPeriodId);
  // "To" can never be earlier than "From" — periods starting before From are not offered.
  const toOptions = useMemo(
    () => (fromPeriod ? periods.filter((p) => p.start_date >= fromPeriod.start_date) : periods),
    [periods, fromPeriod],
  );

  const handleFromChange = (id: string) => {
    setFromPeriodId(id);
    const newFrom = periods.find((p) => p.id === id);
    // If the current "To" would now be before the new "From", snap it forward.
    if (newFrom && toPeriod && toPeriod.start_date < newFrom.start_date) {
      setToPeriodId(id);
      setAsAt(newFrom.end_date);
    }
  };

  const handleToChange = (id: string) => {
    setToPeriodId(id);
    const newTo = periods.find((p) => p.id === id);
    // The trial balance shown is always cumulative as at a date — selecting a "To" period
    // just picks that date for you; the field stays editable for a specific interim date.
    if (newTo) setAsAt(newTo.end_date);
  };

  const { data } = useQuery({
    queryKey: queryKeys.trialBalance(clientId ?? '', asAt, includeDrafts),
    queryFn: () => getTrialBalance(clientId!, asAt, includeDrafts),
    enabled: !!clientId,
  });

  const canPrepareStatements = !!fromPeriodId && !!toPeriodId && !!data && data.balanced;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h2>Trial balance</h2>
        <PrintButton />
      </div>

      <div className="no-print" style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-end', marginBottom: 'var(--space-3)' }}>
        <label style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
          From period
          <select
            value={fromPeriodId}
            onChange={(e) => handleFromChange(e.target.value)}
            style={{ display: 'block', padding: '6px 8px', border: '1px solid var(--rule)', borderRadius: 'var(--radius)' }}
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
          To period
          <select
            value={toPeriodId}
            onChange={(e) => handleToChange(e.target.value)}
            style={{ display: 'block', padding: '6px 8px', border: '1px solid var(--rule)', borderRadius: 'var(--radius)' }}
          >
            {toOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={!canPrepareStatements}
          title={data && !data.balanced ? `Trial balance does not agree (difference ${formatMoney(data.difference)}) — cannot generate statements.` : undefined}
          onClick={() => navigate(`/financial-statements?from=${fromPeriodId}&to=${toPeriodId}`)}
          style={{
            padding: '8px 16px',
            border: 'none',
            background: 'var(--accent)',
            color: '#fff',
            borderRadius: 'var(--radius)',
            opacity: canPrepareStatements ? 1 : 0.5,
          }}
        >
          Prepare financial statements
        </button>
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
            message={`The trial balance does not agree. Difference: ${formatMoney(data.difference)}.${
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
