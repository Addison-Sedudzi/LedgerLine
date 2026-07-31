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

  @Get('trial-balance')
  trialBalance(
    @CurrentClientId() clientId: string,
    @Query('asAt') asAt: string,
    @Query('includeDrafts') includeDrafts?: string,
  ) {
    return this.ledger.trialBalance(clientId, asAt, includeDrafts === 'true');
  }
}
