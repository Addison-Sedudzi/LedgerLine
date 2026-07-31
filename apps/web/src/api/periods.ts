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
