import { Account, AccountType } from '@ledgerline/shared';
import { apiFetch } from './apiClient';

export function listAccounts(clientId: string, filters: { type?: AccountType; active?: boolean } = {}) {
  const params = new URLSearchParams();
  if (filters.type) params.set('type', filters.type);
  if (filters.active !== undefined) params.set('active', String(filters.active));
  const qs = params.toString();
  return apiFetch<Account[]>(`/accounts${qs ? `?${qs}` : ''}`, { clientId });
}

export function getAccount(clientId: string, id: string) {
  return apiFetch<Account & { balance?: string }>(`/accounts/${id}`, { clientId });
}

export function getAccountBalance(clientId: string, id: string, asAt: string) {
  return apiFetch<{ accountId: string; asAt: string; balance: string }>(
    `/accounts/${id}/balance?asAt=${asAt}`,
    { clientId },
  );
}

export function createAccount(
  clientId: string,
  input: { code: string; name: string; type: AccountType; parentId?: string },
) {
  return apiFetch<Account>('/accounts', { method: 'POST', body: input, clientId });
}

export function updateAccount(clientId: string, id: string, patch: { name?: string; isActive?: boolean }) {
  return apiFetch<Account>(`/accounts/${id}`, { method: 'PATCH', body: patch, clientId });
}
