import { Confidence, DocumentStatus } from '@ledgerline/shared';
import { apiFetch, apiUpload } from './apiClient';

export interface DocumentRow {
  id: string;
  client_id: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  uploaded_at: string;
  status: DocumentStatus;
  extracted: {
    supplier: string | null;
    documentNo: string | null;
    documentDate: string | null;
    currency: string | null;
    lineItems: { description: string; amount: string }[];
    subtotal: string | null;
    vat: string | null;
    total: string | null;
    paymentMethod: string | null;
    confidence: Record<string, Confidence>;
  } | null;
  suggested_account_id: string | null;
  suggestion_reason: string | null;
  confidence: Confidence | null;
  resulting_entry_id: string | null;
  rejected_reason: string | null;
}

export function uploadDocument(clientId: string, file: File) {
  return apiUpload<DocumentRow>('/documents', file, clientId);
}

export function listDocuments(clientId: string, status?: DocumentStatus) {
  return apiFetch<DocumentRow[]>(`/documents${status ? `?status=${status}` : ''}`, { clientId });
}

export function getDocument(clientId: string, id: string) {
  return apiFetch<DocumentRow>(`/documents/${id}`, { clientId });
}

export function extractDocument(clientId: string, id: string) {
  return apiFetch<DocumentRow>(`/documents/${id}/extract`, { method: 'POST', clientId });
}

export function approveDocument(
  clientId: string,
  id: string,
  input: { expenseAccountId: string; paymentAccountId: string; amount: string; entryDate: string; narration: string },
) {
  return apiFetch<DocumentRow>(`/documents/${id}/approve`, { method: 'POST', body: input, clientId });
}

export function rejectDocument(clientId: string, id: string, reason: string) {
  return apiFetch<DocumentRow>(`/documents/${id}/reject`, { method: 'POST', body: { reason }, clientId });
}
