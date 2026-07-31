import { JournalEntry, JournalEntrySource, JournalEntryStatus } from '@ledgerline/shared';
import { apiFetch } from './apiClient';

export interface JournalLineInput {
  accountId: string;
  debit?: string;
  credit?: string;
  description?: string;
}

export interface CreateJournalEntryInput {
  periodId: string;
  entryDate: string;
  narration: string;
  source?: JournalEntrySource;
  lines: JournalLineInput[];
}

export interface JournalEntryListItem {
  id: string;
  client_id: string;
  period_id: string;
  entry_no: string | null;
  entry_date: string;
  narration: string;
  source: JournalEntrySource;
  status: JournalEntryStatus;
  reverses_entry_id: string | null;
}

export function listJournalEntries(
  clientId: string,
  filters: {
    periodId?: string;
    from?: string;
    to?: string;
    accountId?: string;
    status?: JournalEntryStatus;
    search?: string;
    page?: number;
  } = {},
) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined) params.set(key, String(value));
  });
  const qs = params.toString();
  return apiFetch<{ rows: JournalEntryListItem[]; total: number }>(
    `/journal-entries${qs ? `?${qs}` : ''}`,
    { clientId },
  );
}

export function getJournalEntry(clientId: string, id: string) {
  return apiFetch<JournalEntry>(`/journal-entries/${id}`, { clientId });
}

export function createJournalEntry(clientId: string, input: CreateJournalEntryInput) {
  return apiFetch<JournalEntry>('/journal-entries', { method: 'POST', body: input, clientId });
}

export function updateJournalEntry(clientId: string, id: string, input: Partial<CreateJournalEntryInput>) {
  return apiFetch<JournalEntry>(`/journal-entries/${id}`, { method: 'PATCH', body: input, clientId });
}

export function deleteJournalEntry(clientId: string, id: string) {
  return apiFetch<{ deleted: true }>(`/journal-entries/${id}`, { method: 'DELETE', clientId });
}

export function postJournalEntry(clientId: string, id: string) {
  return apiFetch<JournalEntry>(`/journal-entries/${id}/post`, { method: 'POST', clientId });
}

export function reverseJournalEntry(clientId: string, id: string, reversalDate?: string) {
  return apiFetch<JournalEntry>(`/journal-entries/${id}/reverse`, {
    method: 'POST',
    body: { reversalDate },
    clientId,
  });
}
