import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useClientPeriod } from '../context/ClientPeriodContext';
import { getGeneralLedger } from '../api/ledger';
import { queryKeys } from '../api/queryKeys';
import { LedgerTable } from '../components/LedgerTable';
import { Figure } from '../components/Figure';
import { DateField } from '../components/DateField';
import { LoadingState } from '../components/LoadingState';
import { formatDate } from '../utils/format';

export function GeneralLedgerPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const { clientId, period } = useClientPeriod();
  // Starting empty rather than defaulting to the active period's dates right here matters:
  // useState's initial-value argument is only ever used from the very first render, and on
  // a fresh navigation `period` can still be loading at that exact instant — falling back to
  // today then would bake "today" into state permanently, which is exactly what made this
  // page look empty on a drill-through. Syncing via the effect below instead means the
  // range is set the moment the period actually becomes available, however many renders
  // that takes, and only once — the guard stops it from stomping on a range the user has
  // since edited by hand.
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rangeInitialized, setRangeInitialized] = useState(false);

  useEffect(() => {
    if (!rangeInitialized && period) {
      setFrom(period.start_date.slice(0, 10));
      setTo(period.end_date.slice(0, 10));
      setRangeInitialized(true);
    }
  }, [period, rangeInitialized]);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.generalLedger(clientId ?? '', accountId ?? '', from, to),
    queryFn: () => getGeneralLedger(clientId!, accountId!, from, to),
    enabled: !!clientId && !!accountId && !!from && !!to,
  });

  return (
    <div>
      <h2>
        {data ? `${data.account.code} — ${data.account.name}` : 'Ledger'}
      </h2>
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <DateField label="From" value={from} onChange={setFrom} />
        <DateField label="To" value={to} onChange={setTo} />
      </div>

      {isLoading && <LoadingState label="Loading account ledger…" />}

      {data && (
        <LedgerTable
          columns={[
            { key: 'date', header: 'Date', render: (l) => formatDate(l.entry_date) },
            { key: 'entryNo', header: 'No.', render: (l) => l.entry_no ?? '—' },
            { key: 'narration', header: 'Narration', render: (l) => l.narration },
            { key: 'contra', header: 'Contra account', render: (l) => l.contra_account ?? '' },
            { key: 'debit', header: 'Debit', align: 'right', render: (l) => <Figure value={l.debit} /> },
            { key: 'credit', header: 'Credit', align: 'right', render: (l) => <Figure value={l.credit} /> },
            { key: 'balance', header: 'Balance', align: 'right', render: (l) => <Figure value={l.running_balance} /> },
          ]}
          rows={[
            {
              entry_id: 'opening',
              entry_date: data.from,
              entry_no: null,
              narration: 'Opening balance',
              contra_account: null,
              debit: '0.00',
              credit: '0.00',
              running_balance: data.openingBalance,
            },
            ...data.lines,
          ]}
          getRowKey={(l) => l.entry_id}
        />
      )}
    </div>
  );
}
