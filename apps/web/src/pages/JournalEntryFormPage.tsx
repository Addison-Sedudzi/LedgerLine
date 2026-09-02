import { Fragment, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Money, sumMoney } from '@ledgerline/shared';
import { useAuth } from '../context/AuthContext';
import { useClientPeriod } from '../context/ClientPeriodContext';
import { listAccounts } from '../api/accounts';
import { createJournalEntry, postJournalEntry } from '../api/journal';
import { queryKeys } from '../api/queryKeys';
import { AccountNameField } from '../components/AccountNameField';
import { DateField } from '../components/DateField';
import { Figure } from '../components/Figure';
import { ErrorState } from '../components/ErrorState';
import { ApiError } from '../api/apiClient';

interface LineState {
  accountId: string | null;
  accountName: string;
  description: string;
  debit: string;
  credit: string;
}

function emptyLine(): LineState {
  return { accountId: null, accountName: '', description: '', debit: '', credit: '' };
}

export function JournalEntryFormPage() {
  const navigate = useNavigate();
  const { clientId, periodId, isPeriodClosed } = useClientPeriod();
  const { me } = useAuth();
  const queryClient = useQueryClient();

  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [narration, setNarration] = useState('');
  const [lines, setLines] = useState<LineState[]>([emptyLine(), emptyLine()]);
  const [error, setError] = useState<string | null>(null);
  const [lastPosted, setLastPosted] = useState<{ entryNo: number | null } | null>(null);

  const { data: accounts = [] } = useQuery({
    queryKey: queryKeys.accounts(clientId ?? ''),
    queryFn: () => listAccounts(clientId!, { active: true }),
    enabled: !!clientId,
  });

  const canPost = me?.role === 'reviewer' || me?.role === 'admin';
  const isAdmin = me?.role === 'admin';

  const totalDebit = sumMoney(lines.map((l) => l.debit || '0'));
  const totalCredit = sumMoney(lines.map((l) => l.credit || '0'));
  const difference = totalDebit.subtract(totalCredit);

  // A blank row (no account, no amount) is just unused space and needs no message. Any row
  // that has been touched at all — an account picked, or an amount typed — must be complete
  // before the entry can be saved, rather than being silently dropped from the payload. This
  // computes the real, always-on validity used to gate submission; whether an issue is shown
  // to the bookkeeper yet is a separate, softer question handled by touchedLines/attemptedSave
  // below — surfacing "no amount" the instant a line gets an account, before they've even
  // reached the amount fields, would be more noise than help.
  const lineIssues = useMemo(
    () =>
      lines.map((line) => {
        const inUse = Boolean(line.accountId || line.accountName.trim() || line.debit || line.credit);
        if (!inUse) return null;
        if (!line.accountId) return 'This line has text but no account selected.';
        if (!line.debit && !line.credit) return 'This line has an account but no debit or credit amount.';
        return null;
      }),
    [lines],
  );
  const usedLineCount = lines.filter((l) => l.accountId || l.accountName.trim() || l.debit || l.credit).length;
  const needsMoreLines = usedLineCount < 2;
  const canSubmit = !needsMoreLines && lineIssues.every((issue) => issue === null) && difference.isZero();

  const [touchedLines, setTouchedLines] = useState<Set<number>>(new Set());
  const [attemptedSave, setAttemptedSave] = useState(false);
  const touchLine = (index: number) => setTouchedLines((prev) => (prev.has(index) ? prev : new Set(prev).add(index)));
  const showLineIssue = (index: number) => (touchedLines.has(index) || attemptedSave) && lineIssues[index];

  const updateLine = (index: number, patch: Partial<LineState>) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  // A suggestion pick, an exact-match blur, or an inline creation all resolve to a real
  // account: id and name are set together so the two can never point at different accounts.
  const setLineAccount = (index: number, accountId: string, accountName: string) => {
    updateLine(index, { accountId, accountName });
  };

  // Free typing. If the line currently has a resolved account and the new text no longer
  // matches that account's name, the id is cleared immediately rather than left stale — a
  // save should never fire against an account whose name the line no longer displays. An
  // exact re-match (or a fresh match) is re-resolved on blur, same as first-time entry.
  const setLineAccountText = (index: number, name: string) => {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l;
        if (!l.accountId) return { ...l, accountName: name };
        const current = accounts.find((a) => a.id === l.accountId);
        const stillMatches = current && current.name.toLowerCase() === name.trim().toLowerCase();
        return { ...l, accountName: name, accountId: stillMatches ? l.accountId : null };
      }),
    );
  };

  const setDebit = (index: number, value: string) => updateLine(index, { debit: value, credit: value ? '' : lines[index].credit });
  const setCredit = (index: number, value: string) => updateLine(index, { credit: value, debit: value ? '' : lines[index].debit });

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
    // Touched-line indices shift down by one for everything after the removed row, so the
    // "touched" state stays attached to the same row rather than sliding onto its neighbour.
    setTouchedLines((prev) => {
      const next = new Set<number>();
      for (const i of prev) {
        if (i < index) next.add(i);
        else if (i > index) next.add(i - 1);
      }
      return next;
    });
  };

  const buildPayload = () => ({
    periodId: periodId!,
    entryDate,
    narration,
    lines: lines
      .filter((l) => l.accountId && (l.debit || l.credit))
      .map((l) => ({
        accountId: l.accountId!,
        debit: l.debit ? Money.of(l.debit).toString() : undefined,
        credit: l.credit ? Money.of(l.credit).toString() : undefined,
        description: l.description || undefined,
      })),
  });

  const createMutation = useMutation({
    mutationFn: () => createJournalEntry(clientId!, buildPayload()),
    onSuccess: (entry) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.journalEntries(clientId!, periodId!, {}) });
      navigate(`/journal/${entry.id}`);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to save draft'),
  });

  const postMutation = useMutation({
    mutationFn: async () => {
      const entry = await createJournalEntry(clientId!, buildPayload());
      return postJournalEntry(clientId!, entry.id);
    },
    onSuccess: (entry) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.journalEntries(clientId!, periodId!, {}) });
      setLastPosted({ entryNo: entry.entryNo });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to post entry'),
  });

  const startNextWithSameDate = () => {
    setLastPosted(null);
    setNarration('');
    setLines([emptyLine(), emptyLine()]);
    setTouchedLines(new Set());
    setAttemptedSave(false);
  };

  // Clicking Save while something's wrong doesn't submit — it's the trigger that reveals
  // every line's issue at once (attemptedSave), rather than the button being disabled and
  // silently doing nothing.
  const handleSaveDraft = () => {
    setAttemptedSave(true);
    if (!canSubmit || isPeriodClosed) return;
    createMutation.mutate();
  };

  const handlePost = () => {
    setAttemptedSave(true);
    if (!canSubmit || isPeriodClosed || !canPost) return;
    if (confirm('Post this entry? A posted entry cannot be edited, only reversed.')) {
      postMutation.mutate();
    }
  };

  if (lastPosted) {
    return (
      <div style={{ maxWidth: 480 }}>
        <h2>Entry posted</h2>
        <p>
          Assigned entry number <strong className="mono">{lastPosted.entryNo}</strong>.
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <button onClick={startNextWithSameDate} style={{ padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius)' }}>
            Start next entry, same date
          </button>
          <button onClick={() => navigate('/journal')} style={{ padding: '8px 16px', border: '1px solid var(--rule)', background: 'var(--paper)', borderRadius: 'var(--radius)' }}>
            Back to list
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
          e.preventDefault();
          handleSaveDraft();
        } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          handlePost();
        }
      }}
    >
      <h2>Raise a journal entry</h2>

      {error && (
        <div style={{ marginBottom: 'var(--space-3)' }}>
          <ErrorState message={error} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
        <DateField label="Date" value={entryDate} onChange={setEntryDate} />
        <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink-muted)' }}>
          Narration
          <input
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
            style={{ padding: '6px 8px', border: '1px solid var(--rule)', borderRadius: 'var(--radius)' }}
          />
        </label>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 'var(--space-3)' }}>
        <thead>
          <tr style={{ textAlign: 'left', fontSize: 12, color: 'var(--ink-muted)' }}>
            <th style={{ width: '35%' }}>Account</th>
            <th>Description</th>
            <th style={{ width: 130 }}>Debit</th>
            <th style={{ width: 130 }}>Credit</th>
            <th style={{ width: 32 }} />
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <Fragment key={index}>
              <tr style={{ borderBottom: showLineIssue(index) ? 'none' : '1px solid var(--rule)' }}>
                <td style={{ padding: '4px 4px 4px 0' }}>
                  <AccountNameField
                    accounts={accounts}
                    clientId={clientId!}
                    canCreate={isAdmin}
                    accountName={line.accountName}
                    onTextChange={(name) => setLineAccountText(index, name)}
                    onSelect={(id, name) => setLineAccount(index, id, name)}
                  />
                </td>
                <td style={{ padding: 4 }}>
                  <input
                    value={line.description}
                    onChange={(e) => updateLine(index, { description: e.target.value })}
                    style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--rule)', borderRadius: 'var(--radius)' }}
                  />
                </td>
                <td style={{ padding: 4 }}>
                  <input
                    className="figure"
                    value={line.debit}
                    onChange={(e) => setDebit(index, e.target.value)}
                    onBlur={() => touchLine(index)}
                    style={{ width: '100%', padding: '6px 8px', textAlign: 'right', border: '1px solid var(--rule)', borderRadius: 'var(--radius)' }}
                  />
                </td>
                <td style={{ padding: 4 }}>
                  <input
                    className="figure"
                    value={line.credit}
                    onChange={(e) => setCredit(index, e.target.value)}
                    onBlur={() => touchLine(index)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && index === lines.length - 1) {
                        e.preventDefault();
                        addLine();
                      }
                    }}
                    style={{ width: '100%', padding: '6px 8px', textAlign: 'right', border: '1px solid var(--rule)', borderRadius: 'var(--radius)' }}
                  />
                </td>
                <td style={{ padding: 4, textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={() => removeLine(index)}
                    disabled={lines.length <= 2}
                    title={lines.length <= 2 ? 'A journal entry needs at least two lines' : 'Remove this line'}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: lines.length <= 2 ? 'var(--ink-muted)' : 'var(--alarm)',
                      cursor: lines.length <= 2 ? 'not-allowed' : 'pointer',
                      fontSize: 16,
                      lineHeight: 1,
                      padding: 4,
                    }}
                  >
                    ×
                  </button>
                </td>
              </tr>
              {showLineIssue(index) && (
                <tr style={{ borderBottom: '1px solid var(--rule)' }}>
                  <td colSpan={5} style={{ padding: '0 4px 6px', color: 'var(--alarm)', fontSize: 12 }}>
                    {lineIssues[index]}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>

      {attemptedSave && needsMoreLines && (
        <div style={{ marginBottom: 'var(--space-3)', color: 'var(--alarm)', fontSize: 13 }}>
          A journal entry needs at least two lines, each with an account and an amount.
        </div>
      )}

      <button onClick={addLine} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, marginBottom: 'var(--space-4)' }}>
        + Add line
      </button>

      <div
        style={{
          position: 'sticky',
          bottom: 0,
          background: 'var(--paper)',
          borderTop: '1px solid var(--rule)',
          padding: 'var(--space-3) 0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', gap: 'var(--space-5)' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>Total debit</div>
            <Figure value={totalDebit.toString()} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>Total credit</div>
            <Figure value={totalCredit.toString()} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>Difference</div>
            <Figure value={difference.toString()} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <button
            disabled={isPeriodClosed || createMutation.isPending}
            onClick={handleSaveDraft}
            title={isPeriodClosed ? 'This period is closed. No postings can be made against it.' : undefined}
            style={{
              padding: '8px 16px',
              border: '1px solid var(--rule)',
              background: 'var(--paper)',
              borderRadius: 'var(--radius)',
              opacity: !canSubmit || isPeriodClosed ? 0.5 : 1,
            }}
          >
            Save draft (Ctrl+S)
          </button>
          {canPost && (
            <button
              disabled={isPeriodClosed || postMutation.isPending}
              onClick={handlePost}
              title={isPeriodClosed ? 'This period is closed. No postings can be made against it.' : undefined}
              style={{
                padding: '8px 16px',
                border: 'none',
                background: 'var(--accent)',
                color: '#fff',
                borderRadius: 'var(--radius)',
                opacity: !canSubmit || isPeriodClosed ? 0.5 : 1,
              }}
            >
              Save and post (Ctrl+Enter)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
