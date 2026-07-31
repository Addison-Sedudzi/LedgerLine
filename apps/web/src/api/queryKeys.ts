// Namespaced by client id and period id so switching either invalidates cleanly — the two
// selectors that almost every screen depends on.
export const queryKeys = {
  accounts: (clientId: string) => ['accounts', clientId] as const,
  account: (clientId: string, id: string) => ['accounts', clientId, id] as const,
  periods: (clientId: string) => ['periods', clientId] as const,
  journalEntries: (clientId: string, periodId: string, filters: Record<string, unknown>) =>
    ['journal-entries', clientId, periodId, filters] as const,
  journalEntry: (clientId: string, id: string) => ['journal-entries', clientId, 'one', id] as const,
  generalLedger: (clientId: string, accountId: string, from: string, to: string) =>
    ['ledger', clientId, accountId, from, to] as const,
  trialBalance: (clientId: string, asAt: string, includeDrafts: boolean) =>
    ['trial-balance', clientId, asAt, includeDrafts] as const,
  incomeStatement: (clientId: string, periodId: string) => ['income-statement', clientId, periodId] as const,
  balanceSheet: (clientId: string, asAt: string) => ['balance-sheet', clientId, asAt] as const,
  documents: (clientId: string, status?: string) => ['documents', clientId, status] as const,
  document: (clientId: string, id: string) => ['documents', clientId, 'one', id] as const,
  audit: (clientId: string, filters: Record<string, unknown>) => ['audit', clientId, filters] as const,
};
