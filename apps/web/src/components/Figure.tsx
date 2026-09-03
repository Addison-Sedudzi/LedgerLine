import { Money, MoneyAmount } from '@ledgerline/shared';

interface FigureProps {
  value: MoneyAmount;
  className?: string;
  // The financial statements page passes "-" here: its print output must contain no em
  // dashes at all, and the default "—" is a literal character in the rendered text, not
  // something a print stylesheet can substitute.
  zeroDisplay?: string;
}

// The Ghanaian cedi symbol, used throughout — LedgerLine has one currency (see CLAUDE.md's
// "what NOT to build": no multi-currency), so this is a constant, not a setting.
const CURRENCY = 'GH₵';

// Renders a decimal-string amount the way a ledger does: a currency symbol, thousand
// separators, two decimal places, a negative shown in parentheses rather than with a minus
// sign, and zero as a dash rather than "0.00" so a page of figures doesn't drown in zeroes.
export function Figure({ value, className, zeroDisplay = '—' }: FigureProps) {
  const money = Money.of(value);

  if (money.isZero()) {
    return <span className={`figure ${className ?? ''}`}>{zeroDisplay}</span>;
  }

  if (money.isNegative()) {
    return (
      <span className={`figure ${className ?? ''}`} style={{ color: 'var(--alarm)' }}>
        ({CURRENCY}{money.negate().format()})
      </span>
    );
  }

  return (
    <span className={`figure ${className ?? ''}`}>
      {CURRENCY}
      {money.format()}
    </span>
  );
}
