import { apiFetch } from './apiClient';

export interface StatementLine {
  accountId: string;
  code: string;
  name: string;
  amount: string;
  priorAmount?: string;
  changeAmount?: string;
  changePercent?: string;
}

export interface IncomeStatement {
  client: { id: string };
  period: { id: string; name: string; startDate: string; endDate: string };
  basisOfPreparation: string;
  isDraft: boolean;
  income: StatementLine[];
  totalIncome: string;
  expenses: StatementLine[];
  totalExpenses: string;
  profitForPeriod: string;
  comparative?: { priorProfitForPeriod?: string };
}

export interface BalanceSheet {
  client: { id: string };
  asAt: string;
  basisOfPreparation: string;
  assets: StatementLine[];
  totalAssets: string;
  liabilities: StatementLine[];
  totalLiabilities: string;
  equity: StatementLine[];
  totalEquity: string;
  totalLiabilitiesAndEquity: string;
  balances: boolean;
  difference: string;
  comparative?: { totalAssets: string; totalLiabilities: string; totalEquity: string };
}

export function getIncomeStatement(clientId: string, periodId: string, comparative = false) {
  return apiFetch<IncomeStatement>(
    `/reports/income-statement?periodId=${periodId}&comparative=${comparative}`,
    { clientId },
  );
}

export function getBalanceSheet(clientId: string, asAt: string, comparative = false) {
  return apiFetch<BalanceSheet>(`/reports/balance-sheet?asAt=${asAt}&comparative=${comparative}`, {
    clientId,
  });
}

// The income statement half of GET /reports/statements — a date range spanning one or more
// periods, split into cost of sales / operating expense by each account's subtype.
export interface RangeIncomeStatement {
  client: { id: string };
  from: string;
  to: string;
  basisOfPreparation: string;
  income: StatementLine[];
  totalIncome: string;
  hasCostOfSales: boolean;
  costOfSales: StatementLine[];
  totalCostOfSales: string;
  grossProfit: string;
  operatingExpenses: StatementLine[];
  totalOperatingExpenses: string;
  profitForPeriod: string;
}

export interface StatementsPack {
  range: { fromPeriodId: string; toPeriodId: string; fromDate: string; toDate: string };
  incomeStatement: RangeIncomeStatement;
  balanceSheet: BalanceSheet;
}

export function getStatements(clientId: string, fromPeriodId: string, toPeriodId: string) {
  return apiFetch<StatementsPack>(
    `/reports/statements?fromPeriodId=${fromPeriodId}&toPeriodId=${toPeriodId}`,
    { clientId },
  );
}
