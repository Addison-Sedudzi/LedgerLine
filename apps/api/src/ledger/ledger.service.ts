import { Injectable } from '@nestjs/common';
import { AccountLedger, AccountType, LedgerLine, LedgerResponse, Money, sumMoney, TrialBalanceResponse } from '@ledgerline/shared';
import { AccountsRepository, AccountRow } from '../accounts/accounts.repository';
import { PeriodsRepository } from '../periods/periods.repository';
import { NotFoundError } from '../common/errors/domain-errors';
import { LedgerRepository, PeriodLedgerLineRow } from './ledger.repository';

// Same order the Chart of Accounts and the seed data already use — Assets, Liabilities,
// Equity, Revenue (INCOME), Expenses.
const TYPE_ORDER: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];

function toLedgerLine(row: PeriodLedgerLineRow, amount: string): LedgerLine {
  return {
    entryId: row.entry_id,
    lineNo: row.line_no,
    entryDate: row.entry_date,
    entryNo: row.entry_no !== null ? Number(row.entry_no) : null,
    narration: row.narration,
    description: row.description,
    amount,
  };
}

// Same convention trialBalance() below uses: compute the net movement as if the account
// sat on its own normal side, then read the actual side off the sign of that. An account
// can genuinely finish a period on its abnormal side — a bank account overdrawn into
// credit, say — and that is reported via isAbnormalBalance, never silently hidden or
// flipped to look normal.
function buildAccountLedger(account: AccountRow, lines: PeriodLedgerLineRow[]): AccountLedger {
  const debitRows = lines.filter((l) => Money.of(l.debit).isPositive());
  const creditRows = lines.filter((l) => Money.of(l.credit).isPositive());
  const totalDebit = sumMoney(debitRows.map((l) => l.debit));
  const totalCredit = sumMoney(creditRows.map((l) => l.credit));

  const netOnNormalSide =
    account.normal_balance === 'DEBIT' ? totalDebit.subtract(totalCredit) : totalCredit.subtract(totalDebit);
  const onAbnormalSide = netOnNormalSide.isNegative();
  const balanceSide = onAbnormalSide ? (account.normal_balance === 'DEBIT' ? 'CREDIT' : 'DEBIT') : account.normal_balance;
  const balance = onAbnormalSide ? netOnNormalSide.negate() : netOnNormalSide;

  return {
    accountId: account.id,
    code: account.code,
    name: account.name,
    type: account.type,
    debitLines: debitRows.map((l) => toLedgerLine(l, l.debit)),
    creditLines: creditRows.map((l) => toLedgerLine(l, l.credit)),
    totalDebit: totalDebit.toString(),
    totalCredit: totalCredit.toString(),
    balance: balance.toString(),
    balanceSide,
    isAbnormalBalance: onAbnormalSide,
  };
}

@Injectable()
export class LedgerService {
  constructor(
    private readonly ledger: LedgerRepository,
    private readonly accounts: AccountsRepository,
    private readonly periods: PeriodsRepository,
  ) {}

  // Every postable, active account for the client, as a T-account of everything posted to
  // it within the given period — including accounts with nothing posted this period, so the
  // frontend's "show empty accounts" toggle needs no second request.
  async ledgerForPeriod(clientId: string, periodId: string): Promise<LedgerResponse> {
    const period = await this.periods.findById(clientId, periodId);
    if (!period) throw new NotFoundError('Period', periodId);

    const [accountRows, lineRows] = await Promise.all([
      this.accounts.findAll(clientId, { active: true }),
      this.ledger.ledgerLinesForPeriod(clientId, period.start_date, period.end_date),
    ]);

    const linesByAccount = new Map<string, PeriodLedgerLineRow[]>();
    for (const row of lineRows) {
      const list = linesByAccount.get(row.account_id);
      if (list) list.push(row);
      else linesByAccount.set(row.account_id, [row]);
    }

    const accounts = accountRows
      .filter((a) => a.is_postable)
      .map((a) => buildAccountLedger(a, linesByAccount.get(a.id) ?? []))
      .sort((a, b) => {
        const typeDiff = TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type);
        return typeDiff !== 0 ? typeDiff : a.code.localeCompare(b.code);
      });

    // Summing every account's balance, split by which side it landed on, must total the
    // same on both sides — the same conservation the trial balance's own totalDebit/
    // totalCredit rests on, just for one period's postings instead of everything up to a
    // date. See CONSISTENCY CHECK in the Ledger page: this is what it displays.
    let totalDebitBalances = Money.zero();
    let totalCreditBalances = Money.zero();
    for (const a of accounts) {
      if (a.balanceSide === 'DEBIT') totalDebitBalances = totalDebitBalances.add(a.balance);
      else totalCreditBalances = totalCreditBalances.add(a.balance);
    }

    return {
      periodId,
      accounts,
      totalDebitBalances: totalDebitBalances.toString(),
      totalCreditBalances: totalCreditBalances.toString(),
      balanced: totalDebitBalances.equals(totalCreditBalances),
    };
  }

  async accountLedgerForPeriod(clientId: string, accountId: string, periodId: string): Promise<AccountLedger> {
    const period = await this.periods.findById(clientId, periodId);
    if (!period) throw new NotFoundError('Period', periodId);
    const account = await this.accounts.findById(clientId, accountId);
    if (!account) throw new NotFoundError('Account', accountId);

    const lines = await this.ledger.ledgerLinesForAccountInPeriod(clientId, accountId, period.start_date, period.end_date);
    return buildAccountLedger(account, lines);
  }

  async generalLedger(
    clientId: string,
    accountId: string,
    from: string,
    to: string,
    includeDrafts: boolean,
  ) {
    const account = await this.accounts.findById(clientId, accountId);
    if (!account) throw new NotFoundError('Account', accountId);

    const opening = await this.ledger.openingBalance(
      clientId,
      accountId,
      from,
      account.normal_balance,
      includeDrafts,
    );
    const rows = await this.ledger.generalLedger(
      clientId,
      accountId,
      from,
      to,
      account.normal_balance,
      opening,
      includeDrafts,
    );

    return {
      account: { id: account.id, code: account.code, name: account.name },
      from,
      to,
      includesDrafts: includeDrafts,
      openingBalance: Money.of(opening).toString(),
      lines: rows,
      closingBalance: rows.length > 0 ? rows[rows.length - 1].running_balance : Money.of(opening).toString(),
    };
  }

  // Thin wrapper for the Trial Balance page's period-range selector: resolves the "to"
  // period to its end date and delegates to trialBalance() unchanged below — a trial
  // balance is a point-in-time cumulative fact, so only "to" affects the figures (see the
  // fromPeriodId note on ReportsController.statements). "from" is still accepted and
  // validated so the UI's range genuinely drives the request, and so a future caller that
  // does need it has it to hand.
  async trialBalanceForPeriodRange(
    clientId: string,
    fromPeriodId: string,
    toPeriodId: string,
    includeDrafts: boolean,
  ): Promise<TrialBalanceResponse> {
    const [fromPeriod, toPeriod] = await Promise.all([
      this.periods.findById(clientId, fromPeriodId),
      this.periods.findById(clientId, toPeriodId),
    ]);
    if (!fromPeriod) throw new NotFoundError('Period', fromPeriodId);
    if (!toPeriod) throw new NotFoundError('Period', toPeriodId);
    return this.trialBalance(clientId, toPeriod.end_date, includeDrafts);
  }

  async trialBalance(clientId: string, asAt: string, includeDrafts: boolean): Promise<TrialBalanceResponse> {
    const accountRows = await this.ledger.trialBalance(clientId, asAt, includeDrafts);

    const rows = accountRows.map((r) => {
      const balance = Money.of(r.balance);
      const isDebitSide = balance.isPositive() ? r.normal_balance === 'DEBIT' : r.normal_balance === 'CREDIT';
      const magnitude = balance.isNegative() ? balance.negate() : balance;
      return {
        accountId: r.account_id,
        code: r.code,
        name: r.name,
        type: r.type,
        debit: isDebitSide ? magnitude.toString() : '0.00',
        credit: isDebitSide ? '0.00' : magnitude.toString(),
      };
    });

    const totalDebit = sumMoney(rows.map((r) => r.debit));
    const totalCredit = sumMoney(rows.map((r) => r.credit));
    const balanced = totalDebit.equals(totalCredit);
    const difference = totalDebit.subtract(totalCredit);
    const absDifference = difference.isNegative() ? difference.negate() : difference;

    let diagnostics: TrialBalanceResponse['diagnostics'];
    if (!balanced) {
      const diffValue = Number(absDifference.toString());
      const divisibleByNine = diffValue !== 0 && Math.round((diffValue % 9) * 100) === 0;

      const postedAmounts = await this.ledger.postedAmountsUpTo(clientId, asAt);
      const matchesDoublePostedAmount = postedAmounts.some((amount) => {
        const doubled = Money.of(amount).multiply(2);
        return doubled.equals(absDifference);
      });

      diagnostics = { divisibleByNine, matchesDoublePostedAmount };
    }

    return {
      asAt,
      includesDrafts: includeDrafts,
      rows,
      totalDebit: totalDebit.toString(),
      totalCredit: totalCredit.toString(),
      balanced,
      difference: difference.toString(),
      diagnostics,
    };
  }
}
