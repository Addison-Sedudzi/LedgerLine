import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ClientScopeGuard } from '../common/guards/client-scope.guard';
import { CurrentClientId } from '../common/decorators/current-client-id.decorator';
import { PeriodsRepository } from '../periods/periods.repository';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(ClientScopeGuard)
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly periods: PeriodsRepository,
  ) {}

  @Get('income-statement')
  incomeStatement(
    @CurrentClientId() clientId: string,
    @Query('periodId') periodId: string,
    @Query('comparative') comparative?: string,
  ) {
    return this.reports.incomeStatement(clientId, periodId, comparative === 'true');
  }

  @Get('balance-sheet')
  balanceSheet(
    @CurrentClientId() clientId: string,
    @Query('asAt') asAt: string,
    @Query('comparative') comparative?: string,
  ) {
    return this.reports.balanceSheet(clientId, asAt, comparative === 'true');
  }

  @Get('statement-pack')
  async statementPack(
    @CurrentClientId() clientId: string,
    @Query('periodId') periodId: string,
  ) {
    const period = await this.periods.findById(clientId, periodId);
    const asAt = period ? period.end_date : new Date().toISOString().slice(0, 10);
    const [incomeStatement, balanceSheet] = await Promise.all([
      this.reports.incomeStatement(clientId, periodId, true),
      this.reports.balanceSheet(clientId, asAt, true),
    ]);
    return { incomeStatement, balanceSheet };
  }
}
