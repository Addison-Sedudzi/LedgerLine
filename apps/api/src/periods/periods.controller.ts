import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ClientScopeGuard } from '../common/guards/client-scope.guard';
import { CurrentClientId } from '../common/decorators/current-client-id.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreatePeriodDto } from './dto/create-period.dto';
import { PeriodsService } from './periods.service';

@Controller('periods')
@UseGuards(ClientScopeGuard)
export class PeriodsController {
  constructor(private readonly periods: PeriodsService) {}

  @Get()
  list(@CurrentClientId() clientId: string) {
    return this.periods.list(clientId);
  }

  @Post()
  @Roles('admin')
  create(@CurrentClientId() clientId: string, @Body() dto: CreatePeriodDto) {
    return this.periods.create(clientId, dto);
  }
}
