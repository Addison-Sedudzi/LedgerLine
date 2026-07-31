import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { PeriodsModule } from '../periods/periods.module';
import { AuditModule } from '../audit/audit.module';
import { JournalController } from './journal.controller';
import { JournalService } from './journal.service';
import { JournalRepository } from './journal.repository';

@Module({
  imports: [AccountsModule, PeriodsModule, AuditModule],
  controllers: [JournalController],
  providers: [JournalService, JournalRepository],
  exports: [JournalRepository, JournalService],
})
export class JournalModule {}
