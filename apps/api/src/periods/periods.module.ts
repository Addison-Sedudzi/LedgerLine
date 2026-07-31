import { Module } from '@nestjs/common';
import { PeriodsController } from './periods.controller';
import { PeriodsRepository } from './periods.repository';

@Module({
  controllers: [PeriodsController],
  providers: [PeriodsRepository],
  exports: [PeriodsRepository],
})
export class PeriodsModule {}
