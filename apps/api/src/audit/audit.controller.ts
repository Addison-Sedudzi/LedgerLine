import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentClientId } from '../common/decorators/current-client-id.decorator';
import { AuditService } from './audit.service';

@Controller('audit')
@Roles('reviewer', 'admin')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async list(
    @CurrentClientId() clientId: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('actorId') actorId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
  ) {
    return this.auditService.list({
      clientId,
      entityType,
      entityId,
      actorId,
      from,
      to,
      page: Number(page),
      pageSize: Number(pageSize),
    });
  }
}
