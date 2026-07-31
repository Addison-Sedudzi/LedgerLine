import { ChangeEvent, DragEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DocumentStatus } from '@ledgerline/shared';
import { useClientPeriod } from '../context/ClientPeriodContext';
import { listDocuments, uploadDocument, extractDocument } from '../api/documents';
import { queryKeys } from '../api/queryKeys';
import { LedgerTable } from '../components/LedgerTable';
import { StatusPill } from '../components/StatusPill';
import { EmptyState } from '../components/EmptyState';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function DocumentsInboxPage() {
  const navigate = useNavigate();
  const { clientId } = useClientPeriod();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<DocumentStatus | ''>('');
  const [uploading, setUploading] = useState(0);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

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

  const uploadFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((f) => ACCEPTED_TYPES.includes(f.type));
    if (files.length === 0) return;
    setUploading(files.length);
    for (const file of files) {
      await uploadMutation.mutateAsync(file);
      setUploading((n) => n - 1);
    }
  };

  const handleFileInput = async (e: ChangeEvent<HTMLInputElement>) => {
    await uploadFiles(e.target.files ?? []);
    e.target.value = '';
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    await uploadFiles(e.dataTransfer.files);
  };

  const sorted = [...documents].sort((a, b) => a.uploaded_at.localeCompare(b.uploaded_at));

  return (
    <div>
      <h2>Document inbox</h2>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={handleDrop}
        style={{
          border: `1px dashed ${isDraggingOver ? 'var(--accent)' : 'var(--rule)'}`,
          borderRadius: 'var(--radius)',
          padding: 'var(--space-5)',
          textAlign: 'center',
          marginBottom: 'var(--space-4)',
          background: isDraggingOver ? 'var(--greenbar)' : 'transparent',
        }}
      >
        <p style={{ color: 'var(--ink-muted)', margin: 0, marginBottom: 'var(--space-3)' }}>
          Drag invoices or receipts here, or
        </p>
        <label
          style={{
            display: 'inline-block',
            padding: '8px 16px',
            background: 'var(--accent)',
            color: '#fff',
            borderRadius: 'var(--radius)',
            cursor: 'pointer',
          }}
        >
          {uploading > 0 ? `Uploading ${uploading}…` : 'Choose files'}
          <input type="file" multiple accept={ACCEPTED_TYPES.join(',')} onChange={handleFileInput} style={{ display: 'none' }} />
        </label>
        <p style={{ color: 'var(--ink-muted)', fontSize: 12, marginTop: 'var(--space-2)', marginBottom: 0 }}>
          JPEG, PNG or WebP — a phone photo works fine.
        </p>
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
