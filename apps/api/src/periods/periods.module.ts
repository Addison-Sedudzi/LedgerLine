import { Module } from '@nestjs/common';
import { PeriodsController } from './periods.controller';
import { PeriodsRepository } from './periods.repository';
import { PeriodsService } from './periods.service';

@Module({
  controllers: [PeriodsController],
  providers: [PeriodsRepository, PeriodsService],
  exports: [PeriodsRepository],
})
export class PeriodsModule {}
