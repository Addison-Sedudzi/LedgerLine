import { Money, MoneyAmount } from '@ledgerline/shared';

interface FigureProps {
  value: MoneyAmount;
  className?: string;
  // The financial statements page passes "-" here: its print output must contain no em
  // dashes at all, and the default "—" is a literal character in the rendered text, not
  // something a print stylesheet can substitute.
  zeroDisplay?: string;
  // The balance sheet and income statement show every component of the chart of accounts,
  // including ones with nothing posted to them — the dash placeholder exists so a page of
  // real ledger detail isn't drowned in zeroes, but a statement listing every line item is
  // making a different claim ("here is the whole structure, and this is what's in it"),
  // where a bare zero is the honest figure and a dash would read as "not applicable" or
  // "not yet known" instead of "confirmed nil". Overrides zeroDisplay when true.
  showZero?: boolean;
}

// The Ghanaian cedi symbol, used throughout — LedgerLine has one currency (see CLAUDE.md's
// "what NOT to build": no multi-currency), so this is a constant, not a setting.
const CURRENCY = 'GH₵';

// Renders a decimal-string amount the way a ledger does: a currency symbol, thousand
// separators, two decimal places, a negative shown in parentheses rather than with a minus
// sign, and zero as a dash rather than "0.00" so a page of figures doesn't drown in zeroes.
export function Figure({ value, className, zeroDisplay = '—', showZero = false }: FigureProps) {
  const money = Money.of(value);

  if (money.isZero() && !showZero) {
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
