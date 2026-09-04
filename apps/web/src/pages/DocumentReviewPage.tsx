import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useClientPeriod } from '../context/ClientPeriodContext';
import { getDocument, approveDocument, rejectDocument } from '../api/documents';
import { ApiError, apiFetchBlobUrl } from '../api/apiClient';
import { listAccounts } from '../api/accounts';
import { queryKeys } from '../api/queryKeys';
import { AccountPicker } from '../components/AccountPicker';
import { DateField } from '../components/DateField';
import { Figure } from '../components/Figure';
import { LedgerTable } from '../components/LedgerTable';
import { ErrorState } from '../components/ErrorState';
import { formatMoney } from '../utils/format';

export function DocumentReviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { clientId } = useClientPeriod();
  const queryClient = useQueryClient();

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [expenseAccountId, setExpenseAccountId] = useState<string | null>(null);
  const [paymentAccountId, setPaymentAccountId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [entryDate, setEntryDate] = useState('');
  const [narration, setNarration] = useState('');

  const { data: doc } = useQuery({
    queryKey: queryKeys.document(clientId ?? '', id ?? ''),
    queryFn: () => getDocument(clientId!, id!),
    enabled: !!clientId && !!id,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: queryKeys.accounts(clientId ?? ''),
    queryFn: () => listAccounts(clientId!, { active: true }),
    enabled: !!clientId,
  });

  useEffect(() => {
    if (!clientId || !id) return;
    apiFetchBlobUrl(`/documents/${id}/file`, clientId).then(setImageUrl).catch(() => setImageUrl(null));
  }, [clientId, id]);

  useEffect(() => {
    if (!doc) return;
    setExpenseAccountId(doc.suggested_account_id);
    setAmount(doc.extracted?.total ?? '');
    setEntryDate(doc.extracted?.documentDate ?? new Date().toISOString().slice(0, 10));
    setNarration(doc.extracted?.supplier ? `Purchase from ${doc.extracted.supplier}` : 'Purchase');
  }, [doc]);

  const approveMutation = useMutation({
    mutationFn: () =>
      approveDocument(clientId!, id!, {
        expenseAccountId: expenseAccountId!,
        paymentAccountId: paymentAccountId!,
        amount,
        entryDate,
        narration,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documents(clientId!) });
      navigate('/documents');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => {
      const reason = prompt('Reason for rejecting this document:');
      if (!reason) throw new Error('cancelled');
      return rejectDocument(clientId!, id!, reason);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.documents(clientId!) });
      navigate('/documents');
    },
  });

  if (!doc) return <p>Loading…</p>;

  const canApprove = Boolean(doc.status === 'EXTRACTED' && expenseAccountId && paymentAccountId && amount && entryDate);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)' }}>
      <div>
        <h3>Source document</h3>
        {imageUrl ? (
          <img src={imageUrl} alt={doc.original_filename} style={{ maxWidth: '100%', border: '1px solid var(--rule)' }} />
        ) : (
          <p style={{ color: 'var(--ink-muted)' }}>Loading image…</p>
        )}
      </div>

      <div>
        <h3>Extracted fields</h3>
        {doc.extracted ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
              Supplier: {doc.extracted.supplier ?? '—'} (confidence: {doc.extracted.confidence?.supplier ?? 'n/a'})
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
              Total: {doc.extracted.total ? formatMoney(doc.extracted.total) : '—'} (confidence: {doc.extracted.confidence?.total ?? 'n/a'})
            </div>

            <label style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
              Suggested account
              {doc.suggestion_reason && (
                <div style={{ fontSize: 11, fontStyle: 'italic', marginBottom: 4 }}>{doc.suggestion_reason}</div>
              )}
              <AccountPicker accounts={accounts} value={expenseAccountId} onChange={setExpenseAccountId} placeholder="Expense account" />
            </label>

            <label style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
              Paid from
              <AccountPicker accounts={accounts} value={paymentAccountId} onChange={setPaymentAccountId} placeholder="Cash / bank account" />
            </label>

            <label style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
              Amount
              <input value={amount} onChange={(e) => setAmount(e.target.value)} className="figure" style={{ display: 'block', width: '100%', padding: 6 }} />
            </label>

            <DateField label="Entry date" value={entryDate} onChange={setEntryDate} />

            <label style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
              Narration
              <input value={narration} onChange={(e) => setNarration(e.target.value)} style={{ display: 'block', width: '100%', padding: 6 }} />
            </label>

            {expenseAccountId && paymentAccountId && amount && (
              <div>
                <h4>Journal entry preview</h4>
                <LedgerTable
                  columns={[
                    { key: 'account', header: 'Account', render: (r: { name: string }) => r.name },
                    { key: 'debit', header: 'Debit', align: 'right', render: (r: { debit: string }) => <Figure value={r.debit} /> },
                    { key: 'credit', header: 'Credit', align: 'right', render: (r: { credit: string }) => <Figure value={r.credit} /> },
                  ]}
                  rows={[
                    { name: accounts.find((a) => a.id === expenseAccountId)?.name ?? '', debit: amount, credit: '0' },
                    { name: accounts.find((a) => a.id === paymentAccountId)?.name ?? '', debit: '0', credit: amount },
                  ]}
                  getRowKey={(r) => r.name}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              {approveMutation.isError && (
                <ErrorState
                  message={approveMutation.error instanceof ApiError ? approveMutation.error.message : 'Failed to approve document'}
                />
              )}
              <button
                type="button"
                disabled={!canApprove || approveMutation.isPending}
                onClick={() => approveMutation.mutate()}
                style={{ padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius)' }}
              >
                Approve and create draft entry
              </button>
              <button
                onClick={() => rejectMutation.mutate()}
                style={{ padding: '8px 16px', border: '1px solid var(--rule)', background: 'var(--paper)', borderRadius: 'var(--radius)' }}
              >
                Reject
              </button>
            </div>

            <p style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 'var(--space-4)' }}>
              Extracted by AI, reviewed by you.
            </p>
          </div>
        ) : (
          <p style={{ color: 'var(--ink-muted)' }}>
            {doc.status === 'EXTRACTION_FAILED' ? 'Extraction failed for this document.' : 'Not yet extracted.'}
          </p>
        )}
      </div>
    </div>
  );
}
