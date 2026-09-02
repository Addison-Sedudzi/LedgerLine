import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { PeriodsModule } from '../periods/periods.module';
import { LedgerController } from './ledger.controller';
import { LedgerService } from './ledger.service';
import { LedgerRepository } from './ledger.repository';

@Module({
  imports: [AccountsModule, PeriodsModule],
  controllers: [LedgerController],
  providers: [LedgerService, LedgerRepository],
  exports: [LedgerRepository, LedgerService],
})
export class LedgerModule {}
