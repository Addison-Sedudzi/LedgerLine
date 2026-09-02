import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ClientScopeGuard } from '../common/guards/client-scope.guard';
import { CurrentClientId } from '../common/decorators/current-client-id.decorator';
import { LedgerService } from './ledger.service';

@Controller()
@UseGuards(ClientScopeGuard)
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get('ledger/general/:accountId')
  generalLedger(
    @CurrentClientId() clientId: string,
    @Param('accountId') accountId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('includeDrafts') includeDrafts?: string,
  ) {
    return this.ledger.generalLedger(clientId, accountId, from, to, includeDrafts === 'true');
  }

  // Every account's T-account for the given period, in one response — backs the Ledger page.
  @Get('ledger')
  ledgerForPeriod(@CurrentClientId() clientId: string, @Query('periodId') periodId: string) {
    return this.ledger.ledgerForPeriod(clientId, periodId);
  }

  // One account's T-account for the given period, for pages that link straight to a single
  // account (e.g. a future account detail page) without fetching the whole ledger.
  @Get('ledger/:accountId')
  accountLedgerForPeriod(
    @CurrentClientId() clientId: string,
    @Param('accountId') accountId: string,
    @Query('periodId') periodId: string,
  ) {
    return this.ledger.accountLedgerForPeriod(clientId, accountId, periodId);
  }

  @Get('trial-balance')
  trialBalance(
    @CurrentClientId() clientId: string,
    @Query('asAt') asAt: string,
    @Query('fromPeriodId') fromPeriodId?: string,
    @Query('toPeriodId') toPeriodId?: string,
    @Query('includeDrafts') includeDrafts?: string,
  ) {
    if (fromPeriodId && toPeriodId) {
      return this.ledger.trialBalanceForPeriodRange(clientId, fromPeriodId, toPeriodId, includeDrafts === 'true');
    }
    return this.ledger.trialBalance(clientId, asAt, includeDrafts === 'true');
  }
}
