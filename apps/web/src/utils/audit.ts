import { Money } from '@ledgerline/shared';
import { formatDate, formatDateTime, formatMoney } from './format';

// Turns raw audit_log rows into something a bookkeeper can read.
//
// The before/after payloads are whatever the service that wrote them happened to hold at
// the time: some are camelCase DTOs (accounts), some are raw snake_case database rows
// (journal entries, fiscal periods). That inconsistency is deliberate on the write side —
// the audit log records exactly what the code saw, and rewriting it to a tidy shape would
// mean the log no longer matches reality. So the tidying happens here, on read, where
// getting it wrong costs nothing.

export interface AuditRow {
  id: number;
  actor_id: string;
  actor_name: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  occurred_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Created',
  UPDATE: 'Updated',
  DELETE: 'Deleted',
  POST: 'Posted',
  REVERSE: 'Reversed',
  APPROVE: 'Approved',
  REJECT: 'Rejected',
  CLOSE_PERIOD: 'Closed period',
  REOPEN_PERIOD: 'Reopened period',
  LOGIN: 'Signed in',
};

const ENTITY_LABELS: Record<string, string> = {
  account: 'Account',
  journal_entry: 'Journal entry',
  fiscal_period: 'Period',
  document: 'Document',
};

// snake_case and camelCase spellings of the same field both map to one label, because the
// payloads use both (see the note at the top of this file).
const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  code: 'Code',
  type: 'Type',
  subtype: 'Subtype',
  status: 'Status',
  narration: 'Narration',
  source: 'Source',
  description: 'Description',
  isActive: 'Active',
  is_active: 'Active',
  isPostable: 'Postable',
  is_postable: 'Postable',
  normalBalance: 'Normal balance',
  normal_balance: 'Normal balance',
  entryNo: 'Entry number',
  entry_no: 'Entry number',
  entryDate: 'Entry date',
  entry_date: 'Entry date',
  startDate: 'Start date',
  start_date: 'Start date',
  endDate: 'End date',
  end_date: 'End date',
  postedAt: 'Posted at',
  posted_at: 'Posted at',
  closedAt: 'Closed at',
  closed_at: 'Closed at',
};

// Identifiers, foreign keys and bookkeeping columns that say nothing a reader wants: they
// never change in a way that means anything on its own, or they duplicate what the Entity
// column already shows.
const HIDDEN_FIELDS = new Set([
  'id',
  'clientId',
  'client_id',
  'periodId',
  'period_id',
  'parentId',
  'parent_id',
  'createdAt',
  'created_at',
  'createdBy',
  'created_by',
  'postedBy',
  'posted_by',
  'closedBy',
  'closed_by',
  'reversesEntryId',
  'reverses_entry_id',
  'lines',
]);

const DATE_FIELDS = new Set(['entryDate', 'entry_date', 'startDate', 'start_date', 'endDate', 'end_date']);
const TIMESTAMP_FIELDS = new Set(['postedAt', 'posted_at', 'closedAt', 'closed_at']);

// Looks in "after" first, then falls back to "before". Both are consulted because neither
// is reliably complete on its own: a delete has no after at all, and a reversal's after is
// only a pointer to the reversing entry ({ reversedBy }), so the identifying code/name/
// number survives solely in before.
function pick(row: AuditRow, ...keys: string[]): unknown {
  for (const payload of [row.after, row.before]) {
    if (!payload) continue;
    for (const key of keys) {
      if (payload[key] !== undefined && payload[key] !== null && payload[key] !== '') return payload[key];
    }
  }
  return undefined;
}

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/_/g, ' ').toLowerCase();
}

export function actorLabel(row: AuditRow): string {
  return row.actor_name ?? row.actor_email ?? `Unknown user (${row.actor_id.slice(0, 8)})`;
}

// Names the thing that was acted on, using the before/after payload rather than a lookup:
// the entity may since have been deleted (that is exactly what a DELETE row records), and
// the payload is the only place its code and name still survive.
export function entityLabel(row: AuditRow): string {
  const kind = ENTITY_LABELS[row.entity_type] ?? row.entity_type.replace(/_/g, ' ');

  if (row.entity_type === 'account') {
    const code = pick(row, 'code');
    const name = pick(row, 'name');
    if (code && name) return `${kind} ${code} — ${name}`;
  }

  if (row.entity_type === 'journal_entry') {
    const entryNo = pick(row, 'entryNo', 'entry_no');
    const narration = pick(row, 'narration');
    const label = entryNo ? `${kind} ${entryNo}` : `${kind} (draft)`;
    return narration ? `${label} — ${narration}` : label;
  }

  if (row.entity_type === 'fiscal_period') {
    const name = pick(row, 'name');
    if (name) return `${kind} ${name}`;
  }

  return `${kind} ${row.entity_id.slice(0, 8)}`;
}

function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '(none)';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') {
    if (DATE_FIELDS.has(field)) return formatDate(value);
    if (TIMESTAMP_FIELDS.has(field)) return formatDateTime(value);
    return value;
  }
  if (typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
}

export interface AuditChange {
  label: string;
  from: string;
  to: string;
}

// The two sides of a lines payload aren't the same shape — the "before" lines are saved
// rows (they carry accountCode/accountName), the "after" lines are the input that replaced
// them (account id only) — so they can't be compared line by line. The count and the total
// can be, and between them they capture what a draft edit actually did: correcting a figure
// moves the total, adding or removing a line moves the count. Debits are summed rather than
// credits because a balanced entry has the same total either way, and through Money, never
// as JavaScript numbers (CLAUDE.md rule 2).
function summariseLines(lines: unknown): string | null {
  if (!Array.isArray(lines) || lines.length === 0) return null;
  let total = Money.zero();
  for (const line of lines) {
    const debit = (line as { debit?: unknown }).debit;
    if (typeof debit === 'string') total = total.add(debit);
  }
  return `${lines.length} line${lines.length === 1 ? '' : 's'}, ${formatMoney(total.toString())}`;
}

// What actually changed, field by field. For a create there is no "before" so the notable
// identifying fields are listed as the starting state; for a delete there is no "after" and
// the entity label alone already says what went, so nothing is listed.
export function auditChanges(row: AuditRow): AuditChange[] {
  const before = row.before ?? {};
  const after = row.after ?? {};

  if (row.action === 'DELETE') return [];

  // A reversal's "after" is a pointer to the new reversing entry, not a new state for this
  // one — diffing the two would read as though every field on the original had been wiped,
  // which is the opposite of what a reversal does (the original stays exactly as posted,
  // and a separate opposite entry is added). Report the one fact the payload holds.
  if (row.action === 'REVERSE') {
    const reversedBy = after.reversedBy ?? after.reversed_by;
    return [
      {
        label: 'Reversed by',
        from: '',
        to: typeof reversedBy === 'string' ? `a new entry (${reversedBy.slice(0, 8)})` : 'a new entry',
      },
    ];
  }

  if (!row.before && row.after) {
    const notable = ['code', 'name', 'type', 'subtype', 'status', 'entryNo', 'entry_no', 'entryDate', 'entry_date', 'narration'];
    return notable
      .filter((field) => after[field] !== undefined && after[field] !== null && after[field] !== '')
      .map((field) => ({ label: fieldLabel(field), from: '', to: formatValue(field, after[field]) }));
  }

  const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: AuditChange[] = [];
  for (const field of fields) {
    if (HIDDEN_FIELDS.has(field)) continue;
    const from = before[field];
    const to = after[field];
    if (JSON.stringify(from) === JSON.stringify(to)) continue;
    const fromText = formatValue(field, from);
    const toText = formatValue(field, to);
    // Empty string on one side and absent on the other are different values to JSON but the
    // same thing to a reader — listing "(none) → (none)" as a change is just noise.
    if (fromText === toText) continue;
    changes.push({ label: fieldLabel(field), from: fromText, to: toText });
  }

  const linesFrom = summariseLines(before.lines);
  const linesTo = summariseLines(after.lines);
  if (linesFrom && linesTo && linesFrom !== linesTo) {
    changes.push({ label: 'Lines', from: linesFrom, to: linesTo });
  }

  return changes;
}
