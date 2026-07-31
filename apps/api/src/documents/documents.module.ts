import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { PeriodsModule } from '../periods/periods.module';
import { JournalModule } from '../journal/journal.module';
import { AuditModule } from '../audit/audit.module';
import { ClaudeService } from '../intelligence/claude.service';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentsRepository } from './documents.repository';
import { StorageService } from './storage.service';

@Module({
  imports: [AccountsModule, PeriodsModule, JournalModule, AuditModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentsRepository, StorageService, ClaudeService],
})
export class DocumentsModule {}
