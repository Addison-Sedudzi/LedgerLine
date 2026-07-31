import { UserRole } from '@ledgerline/shared';
import { apiFetch } from './apiClient';

export interface Me {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
}

export interface ClientSummary {
  id: string;
  name: string;
  business_type: string | null;
}

export function getMe() {
  return apiFetch<Me>('/me');
}

export function listClients() {
  return apiFetch<ClientSummary[]>('/clients');
}
