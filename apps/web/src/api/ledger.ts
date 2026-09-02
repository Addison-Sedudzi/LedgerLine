import { AccountLedger, LedgerResponse, TrialBalanceResponse } from '@ledgerline/shared';
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

export function getTrialBalanceForPeriodRange(
  clientId: string,
  fromPeriodId: string,
  toPeriodId: string,
  includeDrafts = false,
) {
  return apiFetch<TrialBalanceResponse>(
    `/trial-balance?fromPeriodId=${fromPeriodId}&toPeriodId=${toPeriodId}&includeDrafts=${includeDrafts}`,
    { clientId },
  );
}

export function getLedgerForPeriod(clientId: string, periodId: string) {
  return apiFetch<LedgerResponse>(`/ledger?periodId=${periodId}`, { clientId });
}

export function getAccountLedgerForPeriod(clientId: string, accountId: string, periodId: string) {
  return apiFetch<AccountLedger>(`/ledger/${accountId}?periodId=${periodId}`, { clientId });
}
