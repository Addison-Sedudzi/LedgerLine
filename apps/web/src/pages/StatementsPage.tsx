import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useClientPeriod } from '../context/ClientPeriodContext';
import { getIncomeStatement, getBalanceSheet, StatementLine } from '../api/reports';
import { queryKeys } from '../api/queryKeys';
import { Figure } from '../components/Figure';
import { ErrorState } from '../components/ErrorState';
import { PrintButton, PrintFooter } from '../components/PrintFooter';
import { Link } from 'react-router-dom';

function StatementRows({ lines }: { lines: StatementLine[] }) {
  return (
    <>
      {lines.map((line) => (
        <tr key={line.accountId}>
          <td style={{ padding: '4px 8px' }}>
            <Link to={`/ledger/${line.accountId}`}>{line.name}</Link>
          </td>
          <td style={{ padding: '4px 8px', textAlign: 'right' }} className="figure">
            <Figure value={line.amount} />
          </td>
        </tr>
      ))}
    </>
  );
}

export function StatementsPage() {
  const { clientId, period } = useClientPeriod();
  const [tab, setTab] = useState<'income' | 'balance'>('income');
  const [comparative, setComparative] = useState(false);

  const asAt = period?.end_date ?? new Date().toISOString().slice(0, 10);

  const incomeQuery = useQuery({
    queryKey: [...queryKeys.incomeStatement(clientId ?? '', period?.id ?? ''), comparative],
    queryFn: () => getIncomeStatement(clientId!, period!.id, comparative),
    enabled: !!clientId && !!period && tab === 'income',
  });

  const balanceQuery = useQuery({
    queryKey: [...queryKeys.balanceSheet(clientId ?? '', asAt), comparative],
    queryFn: () => getBalanceSheet(clientId!, asAt, comparative),
    enabled: !!clientId && tab === 'balance',
    retry: false,
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h2>Financial statements</h2>
        <PrintButton />
      </div>
      <div className="no-print" style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', alignItems: 'center' }}>
        <button onClick={() => setTab('income')} style={{ fontWeight: tab === 'income' ? 700 : 400, border: 'none', background: 'none', cursor: 'pointer' }}>
          Income statement
        </button>
        <button onClick={() => setTab('balance')} style={{ fontWeight: tab === 'balance' ? 700 : 400, border: 'none', background: 'none', cursor: 'pointer' }}>
          Balance sheet
        </button>
        <label style={{ marginLeft: 'auto', fontSize: 13 }}>
          <input type="checkbox" checked={comparative} onChange={(e) => setComparative(e.target.checked)} /> Comparative
        </label>
      </div>

      {tab === 'income' && incomeQuery.data && (
        <div style={{ maxWidth: 640 }}>
          <p style={{ color: 'var(--ink-muted)' }}>
            {incomeQuery.data.period.name} · {incomeQuery.data.isDraft ? 'DRAFT — period not yet closed' : 'FINAL'}
          </p>
          <p style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{incomeQuery.data.basisOfPreparation}</p>

          <h3 style={{ marginTop: 'var(--space-4)' }}>Income</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <StatementRows lines={incomeQuery.data.income} />
              <tr style={{ borderTop: '1px solid var(--ink)' }}>
                <td style={{ padding: '4px 8px', fontWeight: 600 }}>Total income</td>
                <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>
                  <Figure value={incomeQuery.data.totalIncome} />
                </td>
              </tr>
            </tbody>
          </table>

          <h3 style={{ marginTop: 'var(--space-4)' }}>Expenses</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <StatementRows lines={incomeQuery.data.expenses} />
              <tr style={{ borderTop: '1px solid var(--ink)' }}>
                <td style={{ padding: '4px 8px', fontWeight: 600 }}>Total expenses</td>
                <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>
                  <Figure value={incomeQuery.data.totalExpenses} />
                </td>
              </tr>
            </tbody>
          </table>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 'var(--space-4)' }}>
            <tbody>
              <tr style={{ borderTop: '1px solid var(--ink)', borderBottom: '3px double var(--ink)' }}>
                <td style={{ padding: '6px 8px', fontWeight: 700 }}>Profit for the period</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>
                  <Figure value={incomeQuery.data.profitForPeriod} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {tab === 'balance' && balanceQuery.isError && (
        <ErrorState
          message={
            (balanceQuery.error as Error)?.message ??
            'The balance sheet does not balance. Check the trial balance before trusting this statement.'
          }
        />
      )}

      {tab === 'balance' && balanceQuery.data && (
        <div style={{ maxWidth: 640 }}>
          <p style={{ color: 'var(--ink-muted)' }}>As at {balanceQuery.data.asAt}</p>
          <p style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{balanceQuery.data.basisOfPreparation}</p>

          <h3 style={{ marginTop: 'var(--space-4)' }}>Assets</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <StatementRows lines={balanceQuery.data.assets} />
              <tr style={{ borderTop: '1px solid var(--ink)' }}>
                <td style={{ padding: '4px 8px', fontWeight: 600 }}>Total assets</td>
                <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>
                  <Figure value={balanceQuery.data.totalAssets} />
                </td>
              </tr>
            </tbody>
          </table>

          <h3 style={{ marginTop: 'var(--space-4)' }}>Liabilities</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <StatementRows lines={balanceQuery.data.liabilities} />
              <tr style={{ borderTop: '1px solid var(--ink)' }}>
                <td style={{ padding: '4px 8px', fontWeight: 600 }}>Total liabilities</td>
                <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>
                  <Figure value={balanceQuery.data.totalLiabilities} />
                </td>
              </tr>
            </tbody>
          </table>

          <h3 style={{ marginTop: 'var(--space-4)' }}>Equity</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <StatementRows lines={balanceQuery.data.equity} />
              <tr style={{ borderTop: '1px solid var(--ink)', borderBottom: '3px double var(--ink)' }}>
                <td style={{ padding: '6px 8px', fontWeight: 700 }}>Total liabilities and equity</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>
                  <Figure value={balanceQuery.data.totalLiabilitiesAndEquity} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <PrintFooter />
    </div>
  );
}
