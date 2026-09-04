import { PeriodStatus } from '@ledgerline/shared';
import { apiFetch } from './apiClient';

export interface Period {
  id: string;
  client_id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: PeriodStatus;
}

export function listPeriods(clientId: string) {
  return apiFetch<Period[]>('/periods', { clientId });
}

export function createPeriod(
  clientId: string,
  input: { name: string; startDate: string; endDate: string },
) {
  return apiFetch<Period>('/periods', { method: 'POST', body: input, clientId });
}

export function closePeriod(clientId: string, id: string) {
  return apiFetch<Period>(`/periods/${id}/close`, { method: 'POST', clientId });
}
