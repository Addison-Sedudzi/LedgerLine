import { Money, MoneyAmount } from '@ledgerline/shared';

interface FigureProps {
  value: MoneyAmount;
  className?: string;
}

// Renders a decimal-string amount the way a ledger does: thousand separators, two decimal
// places, a negative shown in parentheses rather than with a minus sign, and zero as a dash
// rather than "0.00" so a page of figures doesn't drown in zeroes.
export function Figure({ value, className }: FigureProps) {
  const money = Money.of(value);

  if (money.isZero()) {
    return <span className={`figure ${className ?? ''}`}>—</span>;
  }

  if (money.isNegative()) {
    return (
      <span className={`figure ${className ?? ''}`} style={{ color: 'var(--alarm)' }}>
        ({money.negate().format()})
      </span>
    );
  }

  return <span className={`figure ${className ?? ''}`}>{money.format()}</span>;
}
