import { Controller, Get, UseGuards } from '@nestjs/common';
import { ClientScopeGuard } from '../common/guards/client-scope.guard';
import { CurrentClientId } from '../common/decorators/current-client-id.decorator';
import { PeriodsRepository } from './periods.repository';

@Controller('periods')
@UseGuards(ClientScopeGuard)
export class PeriodsController {
  constructor(private readonly periods: PeriodsRepository) {}

  @Get()
  list(@CurrentClientId() clientId: string) {
    return this.periods.findAll(clientId);
  }
}
