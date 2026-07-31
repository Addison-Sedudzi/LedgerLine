import { Module } from '@nestjs/common';
import { PeriodsModule } from '../periods/periods.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportsRepository } from './reports.repository';

@Module({
  imports: [PeriodsModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsRepository],
})
export class ReportsModule {}
