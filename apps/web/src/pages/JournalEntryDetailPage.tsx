import { useParams, useNavigate, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useClientPeriod } from '../context/ClientPeriodContext';
import { useAuth } from '../context/AuthContext';
import { getJournalEntry, postJournalEntry, reverseJournalEntry } from '../api/journal';
import { queryKeys } from '../api/queryKeys';
import { LedgerTable } from '../components/LedgerTable';
import { Figure } from '../components/Figure';
import { StatusPill } from '../components/StatusPill';
import { ApiError } from '../api/apiClient';

export function JournalEntryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { clientId, isPeriodClosed } = useClientPeriod();
  const { me } = useAuth();
  const queryClient = useQueryClient();

  const { data: entry, isLoading } = useQuery({
    queryKey: queryKeys.journalEntry(clientId ?? '', id ?? ''),
    queryFn: () => getJournalEntry(clientId!, id!),
    enabled: !!clientId && !!id,
  });

  const canReview = me?.role === 'reviewer' || me?.role === 'admin';

  const postMutation = useMutation({
    mutationFn: () => postJournalEntry(clientId!, id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.journalEntry(clientId!, id!) }),
  });

  const reverseMutation = useMutation({
    mutationFn: () => reverseJournalEntry(clientId!, id!),
    onSuccess: (reversal) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.journalEntry(clientId!, id!) });
      navigate(`/journal/${reversal.id}`);
    },
  });

  if (isLoading || !entry) return <p>Loading…</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>
            Entry {entry.entryNo ?? '(draft)'} <StatusPill label={entry.status} />
          </h2>
          <div style={{ color: 'var(--ink-muted)' }}>
            {entry.entryDate} — {entry.narration}
          </div>
          {entry.reversesEntryId && (
            <div style={{ fontSize: 12 }}>
              Reverses <Link to={`/journal/${entry.reversesEntryId}`}>entry {entry.reversesEntryId}</Link>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {entry.status === 'DRAFT' && canReview && (
            <button
              onClick={() => postMutation.mutate()}
              disabled={isPeriodClosed || postMutation.isPending}
              style={{ padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius)' }}
            >
              Post
            </button>
          )}
          {entry.status === 'POSTED' && canReview && (
            <button
              onClick={() => {
                if (confirm('Reverse this entry? This posts a new entry with debits and credits swapped.')) {
                  reverseMutation.mutate();
                }
              }}
              disabled={reverseMutation.isPending}
              style={{ padding: '8px 16px', border: '1px solid var(--rule)', background: 'var(--paper)', borderRadius: 'var(--radius)' }}
            >
              Reverse
            </button>
          )}
        </div>
      </div>

      {postMutation.isError && (
        <p style={{ color: 'var(--alarm)' }}>
          {postMutation.error instanceof ApiError ? postMutation.error.message : 'Failed to post'}
        </p>
      )}

      <LedgerTable
        columns={[
          { key: 'account', header: 'Account', render: (l) => `${l.accountCode} — ${l.accountName}` },
          { key: 'description', header: 'Description', render: (l) => l.description ?? '' },
          { key: 'debit', header: 'Debit', align: 'right', render: (l) => <Figure value={l.debit} /> },
          { key: 'credit', header: 'Credit', align: 'right', render: (l) => <Figure value={l.credit} /> },
        ]}
        rows={entry.lines}
        getRowKey={(l) => l.id}
        totals={{
          debit: <Figure value={entry.lines.reduce((s, l) => s + Number(l.debit), 0).toFixed(2)} />,
          credit: <Figure value={entry.lines.reduce((s, l) => s + Number(l.credit), 0).toFixed(2)} />,
        }}
      />
    </div>
  );
}
