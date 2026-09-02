import { useNavigate } from 'react-router-dom';
import { AccountLedger, AccountType, LedgerLine, Money } from '@ledgerline/shared';
import { Figure } from './Figure';

const TYPE_LABEL: Record<AccountType, string> = {
  ASSET: 'Asset',
  LIABILITY: 'Liability',
  EQUITY: 'Equity',
  INCOME: 'Revenue',
  EXPENSE: 'Expense',
};

// journal_entries.entry_date is a Postgres `date`, which the pg driver hands back as a
// Date object and JSON serialises with a time and a Z — slicing to the first 10 characters
// is always safe here and keeps the ledger showing a plain calendar date.
function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

function Side({ lines }: { lines: LedgerLine[] }) {
  const navigate = useNavigate();
  return (
    <table className="t-account-side" style={{ width: '100%', borderCollapse: 'collapse' }}>
      <tbody>
        {lines.map((l) => (
          <tr
            key={`${l.entryId}-${l.lineNo}`}
            className="t-account-row no-print-hover"
            onClick={() => navigate(`/journal/${l.entryId}`)}
            style={{ cursor: 'pointer' }}
          >
            <td style={{ padding: '3px 6px', whiteSpace: 'nowrap', fontSize: 12 }}>{formatDate(l.entryDate)}</td>
            <td style={{ padding: '3px 6px', fontSize: 13 }}>
              {l.narration}
              {l.description ? <span style={{ color: 'var(--ink-muted)' }}> — {l.description}</span> : null}
            </td>
            <td style={{ padding: '3px 6px', textAlign: 'right' }}>
              <Figure value={l.amount} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TAccount({ account }: { account: AccountLedger }) {
  const plugSide: 'DEBIT' | 'CREDIT' = account.balanceSide === 'DEBIT' ? 'CREDIT' : 'DEBIT';
  const hasPlug = !Money.of(account.balance).isZero();
  // After the plug ("Balance c/d") is added to the smaller side, both columns foot to the
  // same figure — the larger of the two raw totals — exactly like a hand-balanced T-account.
  const grandTotal = account.balanceSide === 'DEBIT' ? account.totalDebit : account.totalCredit;

  return (
    <div
      className="t-account"
      style={{ border: '1px solid var(--rule)', borderRadius: 'var(--radius)', marginBottom: 'var(--space-5)', breakInside: 'avoid' }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          padding: '8px 10px',
          borderBottom: '2px solid var(--ink)',
        }}
      >
        <div>
          <strong>{account.name}</strong>{' '}
          <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>({TYPE_LABEL[account.type]})</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <Figure value={account.balance} /> {account.balanceSide === 'DEBIT' ? 'Dr' : 'Cr'}
          {account.isAbnormalBalance && (
            <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--alarm)' }}>(unusual side)</span>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        <div style={{ borderRight: '1px solid var(--rule)' }}>
          <div style={{ padding: '4px 6px', fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase' }}>
            Debit
          </div>
          <Side lines={account.debitLines} />
          {plugSide === 'DEBIT' && hasPlug && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 6px', fontSize: 13, fontStyle: 'italic' }}>
              <span>Balance c/d</span>
              <Figure value={account.balance} />
            </div>
          )}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '4px 6px',
              borderTop: '1px solid var(--ink)',
              fontWeight: 600,
            }}
          >
            <span>Total</span>
            <Figure value={grandTotal} />
          </div>
        </div>
        <div>
          <div style={{ padding: '4px 6px', fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase' }}>
            Credit
          </div>
          <Side lines={account.creditLines} />
          {plugSide === 'CREDIT' && hasPlug && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 6px', fontSize: 13, fontStyle: 'italic' }}>
              <span>Balance c/d</span>
              <Figure value={account.balance} />
            </div>
          )}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '4px 6px',
              borderTop: '1px solid var(--ink)',
              fontWeight: 600,
            }}
          >
            <span>Total</span>
            <Figure value={grandTotal} />
          </div>
        </div>
      </div>
    </div>
  );
}
