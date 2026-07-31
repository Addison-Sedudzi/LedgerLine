import { Injectable } from '@nestjs/common';
import { Money, sumMoney, TrialBalanceResponse } from '@ledgerline/shared';
import { AccountsRepository } from '../accounts/accounts.repository';
import { NotFoundError } from '../common/errors/domain-errors';
import { LedgerRepository } from './ledger.repository';

@Injectable()
export class LedgerService {
  constructor(
    private readonly ledger: LedgerRepository,
    private readonly accounts: AccountsRepository,
  ) {}

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
