import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useClientPeriod } from '../context/ClientPeriodContext';
import { getGeneralLedger } from '../api/ledger';
import { queryKeys } from '../api/queryKeys';
import { LedgerTable } from '../components/LedgerTable';
import { Figure } from '../components/Figure';
import { DateField } from '../components/DateField';
import { formatDate } from '../utils/format';

export function GeneralLedgerPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const { clientId, period } = useClientPeriod();
  const [from, setFrom] = useState(period?.start_date ?? new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(period?.end_date ?? new Date().toISOString().slice(0, 10));

  const { data } = useQuery({
    queryKey: queryKeys.generalLedger(clientId ?? '', accountId ?? '', from, to),
    queryFn: () => getGeneralLedger(clientId!, accountId!, from, to),
    enabled: !!clientId && !!accountId,
  });

  return (
    <div>
      <h2>
        {data ? `${data.account.code} — ${data.account.name}` : 'General ledger'}
      </h2>
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <DateField label="From" value={from} onChange={setFrom} />
        <DateField label="To" value={to} onChange={setTo} />
      </div>

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
