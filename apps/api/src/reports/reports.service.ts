import { Injectable } from '@nestjs/common';
import { Money, sumMoney } from '@ledgerline/shared';
import { NotFoundError, ValidationError } from '../common/errors/domain-errors';
import { PeriodsRepository } from '../periods/periods.repository';
import { AccountBalanceLine, ReportsRepository } from './reports.repository';

export interface StatementLine {
  accountId: string;
  code: string;
  name: string;
  amount: string;
  priorAmount?: string;
  changeAmount?: string;
  changePercent?: string;
}

function toLines(rows: AccountBalanceLine[]): StatementLine[] {
  return rows.map((r) => ({ accountId: r.account_id, code: r.code, name: r.name, amount: r.balance }));
}

function withComparative(current: StatementLine[], prior: AccountBalanceLine[]): StatementLine[] {
  const priorByAccount = new Map(prior.map((p) => [p.account_id, p.balance]));
  return current.map((line) => {
    const priorAmount = priorByAccount.get(line.accountId) ?? '0.00';
    const change = Money.of(line.amount).subtract(priorAmount);
    const priorValue = Money.of(priorAmount);
    const changePercent = priorValue.isZero() ? null : change.multiply(100).toString() + '%';
    return { ...line, priorAmount, changeAmount: change.toString(), changePercent: changePercent ?? undefined };
  });
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly reports: ReportsRepository,
    private readonly periods: PeriodsRepository,
  ) {}

  private async priorPeriod(clientId: string, startDate: string) {
    const all = await this.periods.findAll(clientId);
    const before = all.filter((p) => p.end_date < startDate).sort((a, b) => (a.end_date < b.end_date ? 1 : -1));
    return before[0] ?? null;
  }

  async incomeStatement(clientId: string, periodId: string, comparative: boolean) {
    const period = await this.periods.findById(clientId, periodId);
    if (!period) throw new NotFoundError('Period', periodId);

    const [incomeRows, expenseRows] = await Promise.all([
      this.reports.movementByTypeInRange(clientId, 'INCOME', period.start_date, period.end_date),
      this.reports.movementByTypeInRange(clientId, 'EXPENSE', period.start_date, period.end_date),
    ]);

    let income = toLines(incomeRows);
    let expenses = toLines(expenseRows);

    let priorProfit: string | undefined;
    if (comparative) {
      const prior = await this.priorPeriod(clientId, period.start_date);
      if (prior) {
        const [priorIncome, priorExpense] = await Promise.all([
          this.reports.movementByTypeInRange(clientId, 'INCOME', prior.start_date, prior.end_date),
          this.reports.movementByTypeInRange(clientId, 'EXPENSE', prior.start_date, prior.end_date),
        ]);
        income = withComparative(income, priorIncome);
        expenses = withComparative(expenses, priorExpense);
        priorProfit = sumMoney(priorIncome.map((r) => r.balance))
          .subtract(sumMoney(priorExpense.map((r) => r.balance)))
          .toString();
      }
    }

    const totalIncome = sumMoney(income.map((r) => r.amount));
    const totalExpenses = sumMoney(expenses.map((r) => r.amount));
    const profit = totalIncome.subtract(totalExpenses);

    return {
      client: { id: clientId },
      period: { id: period.id, name: period.name, startDate: period.start_date, endDate: period.end_date },
      basisOfPreparation: 'Prepared on the accrual basis in accordance with IFRS for SMEs.',
      isDraft: period.status !== 'CLOSED',
      income,
      totalIncome: totalIncome.toString(),
      expenses,
      totalExpenses: totalExpenses.toString(),
      profitForPeriod: profit.toString(),
      comparative: comparative ? { priorProfitForPeriod: priorProfit } : undefined,
    };
  }

  async balanceSheet(clientId: string, asAt: string, comparative: boolean) {
    const [assetRows, liabilityRows, equityRows] = await Promise.all([
      this.reports.balancesByType(clientId, 'ASSET', asAt),
      this.reports.balancesByType(clientId, 'LIABILITY', asAt),
      this.reports.balancesByType(clientId, 'EQUITY', asAt),
    ]);

    // Profit not yet closed to retained earnings still belongs to equity for the balance
    // sheet to balance; year-end closing (which would move it into retained earnings
    // permanently) is out of scope for this build.
    const yearStart = asAt.slice(0, 4) + '-01-01';
    const [incomeRows, expenseRows] = await Promise.all([
      this.reports.movementByTypeInRange(clientId, 'INCOME', yearStart, asAt),
      this.reports.movementByTypeInRange(clientId, 'EXPENSE', yearStart, asAt),
    ]);
    const profitToDate = sumMoney(incomeRows.map((r) => r.balance)).subtract(
      sumMoney(expenseRows.map((r) => r.balance)),
    );

    const assets = toLines(assetRows);
    const liabilities = toLines(liabilityRows);
    const equity = toLines(equityRows);

    const totalAssets = sumMoney(assets.map((r) => r.amount));
    const totalLiabilities = sumMoney(liabilities.map((r) => r.amount));
    const totalEquity = sumMoney(equity.map((r) => r.amount)).add(profitToDate);
    const totalLiabilitiesAndEquity = totalLiabilities.add(totalEquity);

    const balances = totalAssets.equals(totalLiabilitiesAndEquity);
    if (!balances) {
      throw new ValidationError(
        `The balance sheet does not balance as at ${asAt}: total assets ${totalAssets.toString()} vs total ` +
          `liabilities and equity ${totalLiabilitiesAndEquity.toString()} (difference ${totalAssets
            .subtract(totalLiabilitiesAndEquity)
            .toString()}). Check the trial balance before trusting this statement.`,
      );
    }

    let priorTotals: { totalAssets: string; totalLiabilities: string; totalEquity: string } | undefined;
    if (comparative) {
      const prior = await this.priorPeriod(clientId, yearStart);
      if (prior) {
        const priorAsAt = prior.end_date;
        const [priorAssets, priorLiabilities, priorEquity, priorIncome, priorExpense] = await Promise.all([
          this.reports.balancesByType(clientId, 'ASSET', priorAsAt),
          this.reports.balancesByType(clientId, 'LIABILITY', priorAsAt),
          this.reports.balancesByType(clientId, 'EQUITY', priorAsAt),
          this.reports.movementByTypeInRange(clientId, 'INCOME', priorAsAt.slice(0, 4) + '-01-01', priorAsAt),
          this.reports.movementByTypeInRange(clientId, 'EXPENSE', priorAsAt.slice(0, 4) + '-01-01', priorAsAt),
        ]);
        const priorProfitToDate = sumMoney(priorIncome.map((r) => r.balance)).subtract(
          sumMoney(priorExpense.map((r) => r.balance)),
        );
        priorTotals = {
          totalAssets: sumMoney(priorAssets.map((r) => r.balance)).toString(),
          totalLiabilities: sumMoney(priorLiabilities.map((r) => r.balance)).toString(),
          totalEquity: sumMoney(priorEquity.map((r) => r.balance)).add(priorProfitToDate).toString(),
        };
      }
    }

    return {
      client: { id: clientId },
      asAt,
      basisOfPreparation: 'Prepared on the accrual basis in accordance with IFRS for SMEs.',
      assets,
      totalAssets: totalAssets.toString(),
      liabilities,
      totalLiabilities: totalLiabilities.toString(),
      equity: [...equity, { accountId: 'profit-to-date', code: '', name: 'Profit for the year to date', amount: profitToDate.toString() }],
      totalEquity: totalEquity.toString(),
      totalLiabilitiesAndEquity: totalLiabilitiesAndEquity.toString(),
      balances,
      comparative: priorTotals,
    };
  }
}
