import { ChangeEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DocumentStatus } from '@ledgerline/shared';
import { useClientPeriod } from '../context/ClientPeriodContext';
import { listDocuments, uploadDocument, extractDocument } from '../api/documents';
import { queryKeys } from '../api/queryKeys';
import { LedgerTable } from '../components/LedgerTable';
import { StatusPill } from '../components/StatusPill';
import { EmptyState } from '../components/EmptyState';

export function DocumentsInboxPage() {
  const navigate = useNavigate();
  const { clientId } = useClientPeriod();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<DocumentStatus | ''>('');
  const [uploading, setUploading] = useState(0);

  const { data: documents = [], isLoading } = useQuery({
    queryKey: queryKeys.documents(clientId ?? '', status),
    queryFn: () => listDocuments(clientId!, status || undefined),
    enabled: !!clientId,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const doc = await uploadDocument(clientId!, file);
      return extractDocument(clientId!, doc.id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.documents(clientId!, status) }),
  });

  const handleFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setUploading(files.length);
    for (const file of files) {
      await uploadMutation.mutateAsync(file);
      setUploading((n) => n - 1);
    }
    e.target.value = '';
  };

  const sorted = [...documents].sort((a, b) => a.uploaded_at.localeCompare(b.uploaded_at));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <h2>Document inbox</h2>
        <label
          style={{
            padding: '8px 16px',
            background: 'var(--accent)',
            color: '#fff',
            borderRadius: 'var(--radius)',
            cursor: 'pointer',
          }}
        >
          {uploading > 0 ? `Uploading ${uploading}…` : 'Upload documents'}
          <input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={handleFiles} style={{ display: 'none' }} />
        </label>
      </div>

      <select
        value={status}
        onChange={(e) => setStatus(e.target.value as DocumentStatus | '')}
        style={{ padding: '6px 8px', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', marginBottom: 'var(--space-4)' }}
      >
        <option value="">All statuses</option>
        <option value="UPLOADED">Uploaded</option>
        <option value="EXTRACTED">Extracted — needs review</option>
        <option value="EXTRACTION_FAILED">Extraction failed</option>
        <option value="APPROVED">Approved</option>
        <option value="REJECTED">Rejected</option>
      </select>

      {!isLoading && sorted.length === 0 && <EmptyState title="No documents yet. Upload an invoice or receipt to get started." />}

      {sorted.length > 0 && (
        <LedgerTable
          columns={[
            { key: 'filename', header: 'File', render: (d) => d.original_filename },
            { key: 'supplier', header: 'Supplier', render: (d) => d.extracted?.supplier ?? '—' },
            { key: 'total', header: 'Total', align: 'right', render: (d) => d.extracted?.total ?? '—' },
            { key: 'status', header: 'Status', render: (d) => <StatusPill label={d.status} /> },
            { key: 'age', header: 'Uploaded', render: (d) => new Date(d.uploaded_at).toLocaleDateString() },
          ]}
          rows={sorted}
          getRowKey={(d) => d.id}
          onRowActivate={(d) => navigate(`/documents/${d.id}`)}
        />
      )}
    </div>
  );
}
