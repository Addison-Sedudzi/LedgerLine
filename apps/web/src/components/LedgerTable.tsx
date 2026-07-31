import { KeyboardEvent, ReactNode, useRef } from 'react';
import './LedgerTable.css';

export interface LedgerColumn<T> {
  key: string;
  header: string;
  align?: 'left' | 'right';
  render: (row: T) => ReactNode;
}

interface LedgerTableProps<T> {
  columns: LedgerColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  onRowActivate?: (row: T) => void;
  totals?: Record<string, ReactNode>;
  emptyMessage?: string;
}

// The signature component of the whole interface: alternating pale-green row bands, a
// sticky header, hairline rules between columns, and arrow-key navigation between rows —
// the way a bookkeeper reads a printed ledger, one line at a time, without losing their
// place.
export function LedgerTable<T>({
  columns,
  rows,
  getRowKey,
  onRowActivate,
  totals,
  emptyMessage = 'Nothing to show yet.',
}: LedgerTableProps<T>) {
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, index: number) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      rowRefs.current[index + 1]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      rowRefs.current[index - 1]?.focus();
    } else if ((event.key === 'Enter' || event.key === ' ') && onRowActivate) {
      event.preventDefault();
      onRowActivate(rows[index]);
    }
  };

  return (
    <div className="ledger-table-wrap">
      <table className="ledger-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={col.align === 'right' ? 'align-right' : ''}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="ledger-empty">
                {emptyMessage}
              </td>
            </tr>
          )}
          {rows.map((row, index) => (
            <tr
              key={getRowKey(row)}
              ref={(el) => {
                rowRefs.current[index] = el;
              }}
              tabIndex={0}
              className={onRowActivate ? 'ledger-row clickable' : 'ledger-row'}
              onKeyDown={(e) => handleKeyDown(e, index)}
              onClick={() => onRowActivate?.(row)}
            >
              {columns.map((col) => (
                <td key={col.key} className={col.align === 'right' ? 'align-right figure' : ''}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {totals && (
          <tfoot>
            <tr className="ledger-totals">
              {columns.map((col) => (
                <td key={col.key} className={col.align === 'right' ? 'align-right figure' : ''}>
                  {totals[col.key] ?? ''}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
