import { TrialBalanceResponse } from '@ledgerline/shared';
import { apiFetch } from './apiClient';

export interface GeneralLedgerLine {
  entry_id: string;
  entry_date: string;
  entry_no: string | null;
  narration: string;
  contra_account: string | null;
  debit: string;
  credit: string;
  running_balance: string;
}

export interface GeneralLedgerResponse {
  account: { id: string; code: string; name: string };
  from: string;
  to: string;
  includesDrafts: boolean;
  openingBalance: string;
  lines: GeneralLedgerLine[];
  closingBalance: string;
}

export function getGeneralLedger(
  clientId: string,
  accountId: string,
  from: string,
  to: string,
  includeDrafts = false,
) {
  return apiFetch<GeneralLedgerResponse>(
    `/ledger/general/${accountId}?from=${from}&to=${to}&includeDrafts=${includeDrafts}`,
    { clientId },
  );
}

export function getTrialBalance(clientId: string, asAt: string, includeDrafts = false) {
  return apiFetch<TrialBalanceResponse>(`/trial-balance?asAt=${asAt}&includeDrafts=${includeDrafts}`, {
    clientId,
  });
}
