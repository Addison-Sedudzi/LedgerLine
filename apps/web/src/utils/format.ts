import { Money, MoneyAmount } from '@ledgerline/shared';

// LedgerLine has one currency — the Ghanaian cedi (see CLAUDE.md's "what NOT to build": no
// multi-currency) — so this is the one place the symbol is written, shared with Figure.tsx
// for amounts that render as plain text (inside a warning message, a title attribute)
// rather than through that component.
const CURRENCY = 'GH₵';

// For text contexts — warnings, titles — that can't use the <Figure> component's
// parentheses-for-negative styling; used sparingly, and only for already-signed amounts
// where a plain minus sign is acceptable (a difference, not a balance).
export function formatMoney(value: MoneyAmount): string {
  return `${CURRENCY}${Money.of(value).format()}`;
}

// "02 Sep 2026" — the one date format used everywhere in the UI. Takes a plain accounting
// date ("2026-09-02") or a full timestamp; either way only the calendar date is shown, since
// that's what every caller of this needs (an entry date, a period boundary, an audit
// timestamp's day) — see formatDateTime below for the few places that also need the time.
export function formatDate(value: string): string {
  const datePart = value.slice(0, 10);
  const date = new Date(`${datePart}T00:00:00`);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// "02 Sep 2026, 14:35" — for timestamps where the time of day is itself the point (the audit
// trail: when exactly an action happened), not just the date.
export function formatDateTime(value: string): string {
  const date = new Date(value);
  const datePart = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const timePart = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${datePart}, ${timePart}`;
}
