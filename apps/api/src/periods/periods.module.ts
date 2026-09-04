import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PeriodsController } from './periods.controller';
import { PeriodsRepository } from './periods.repository';
import { PeriodsService } from './periods.service';

@Module({
  imports: [AuditModule],
  controllers: [PeriodsController],
  providers: [PeriodsRepository, PeriodsService],
  exports: [PeriodsRepository],
})
export class PeriodsModule {}
