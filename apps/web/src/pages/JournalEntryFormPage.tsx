import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Money, sumMoney } from '@ledgerline/shared';
import { useAuth } from '../context/AuthContext';
import { useClientPeriod } from '../context/ClientPeriodContext';
import { listAccounts } from '../api/accounts';
import { createJournalEntry, postJournalEntry } from '../api/journal';
import { queryKeys } from '../api/queryKeys';
import { AccountPicker } from '../components/AccountPicker';
import { DateField } from '../components/DateField';
import { Figure } from '../components/Figure';
import { ErrorState } from '../components/ErrorState';
import { ApiError } from '../api/apiClient';

interface LineState {
  accountId: string | null;
  description: string;
  debit: string;
  credit: string;
}

function emptyLine(): LineState {
  return { accountId: null, description: '', debit: '', credit: '' };
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

  const totalDebit = sumMoney(lines.map((l) => l.debit || '0'));
  const totalCredit = sumMoney(lines.map((l) => l.credit || '0'));
  const difference = totalDebit.subtract(totalCredit);
  const balanced = difference.isZero() && lines.some((l) => l.accountId);

  const updateLine = (index: number, patch: Partial<LineState>) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const setDebit = (index: number, value: string) => updateLine(index, { debit: value, credit: value ? '' : lines[index].credit });
  const setCredit = (index: number, value: string) => updateLine(index, { credit: value, debit: value ? '' : lines[index].debit });

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);

  const buildPayload = () => ({
    periodId: periodId!,
    entryDate,
    narration,
    lines: lines
      .filter((l) => l.accountId)
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
          if (!isPeriodClosed) createMutation.mutate();
        } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          if (canPost && balanced && !isPeriodClosed) postMutation.mutate();
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
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={index} style={{ borderBottom: '1px solid var(--rule)' }}>
              <td style={{ padding: '4px 4px 4px 0' }}>
                <AccountPicker
                  accounts={accounts}
                  value={line.accountId}
                  onChange={(id) => updateLine(index, { accountId: id })}
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
                  style={{ width: '100%', padding: '6px 8px', textAlign: 'right', border: '1px solid var(--rule)', borderRadius: 'var(--radius)' }}
                />
              </td>
              <td style={{ padding: 4 }}>
                <input
                  className="figure"
                  value={line.credit}
                  onChange={(e) => setCredit(index, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && index === lines.length - 1) {
                      e.preventDefault();
                      addLine();
                    }
                  }}
                  style={{ width: '100%', padding: '6px 8px', textAlign: 'right', border: '1px solid var(--rule)', borderRadius: 'var(--radius)' }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

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
            disabled={!balanced || isPeriodClosed || createMutation.isPending}
            onClick={() => createMutation.mutate()}
            style={{
              padding: '8px 16px',
              border: '1px solid var(--rule)',
              background: 'var(--paper)',
              borderRadius: 'var(--radius)',
              opacity: !balanced || isPeriodClosed ? 0.5 : 1,
            }}
          >
            Save draft (Ctrl+S)
          </button>
          {canPost && (
            <button
              disabled={!balanced || isPeriodClosed || postMutation.isPending}
              onClick={() => {
                if (confirm('Post this entry? A posted entry cannot be edited, only reversed.')) {
                  postMutation.mutate();
                }
              }}
              style={{
                padding: '8px 16px',
                border: 'none',
                background: 'var(--accent)',
                color: '#fff',
                borderRadius: 'var(--radius)',
                opacity: !balanced || isPeriodClosed ? 0.5 : 1,
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
