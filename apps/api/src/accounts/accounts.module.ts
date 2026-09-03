import { Module } from '@nestjs/common';
import { IntelligenceModule } from '../intelligence/intelligence.module';
import { AuditModule } from '../audit/audit.module';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { AccountsRepository } from './accounts.repository';

@Module({
  imports: [IntelligenceModule, AuditModule],
  controllers: [AccountsController],
  providers: [AccountsService, AccountsRepository],
  exports: [AccountsRepository, AccountsService],
})
export class AccountsModule {}
