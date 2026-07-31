import { useClientPeriod } from '../context/ClientPeriodContext';

// Rendered only when printing (see styles/print.css) — a footer identifying the client,
// the period, and the print date, so a printed page can never be mistaken for an
// anonymous export.
export function PrintFooter() {
  const { clients, clientId, period } = useClientPeriod();
  const clientName = clients.find((c) => c.id === clientId)?.name ?? '';

  return (
    <div className="print-footer">
      {clientName} — {period?.name ?? ''} — printed {new Date().toLocaleDateString()}
    </div>
  );
}

export function PrintButton() {
  return (
    <button
      className="no-print"
      onClick={() => window.print()}
      style={{ padding: '6px 14px', border: '1px solid var(--rule)', background: 'var(--paper)', borderRadius: 'var(--radius)' }}
    >
      Print
    </button>
  );
}
