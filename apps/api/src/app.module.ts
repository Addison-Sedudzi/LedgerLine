import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { AuthGuard } from './common/guards/auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { GlobalExceptionFilter } from './common/errors/http-exception.filter';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';
import { HealthModule } from './health/health.module';
import { ClientsModule } from './clients/clients.module';
import { AuditModule } from './audit/audit.module';
import { AccountsModule } from './accounts/accounts.module';
import { PeriodsModule } from './periods/periods.module';
import { JournalModule } from './journal/journal.module';
import { LedgerModule } from './ledger/ledger.module';
import { ReportsModule } from './reports/reports.module';
import { DocumentsModule } from './documents/documents.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    HealthModule,
    ClientsModule,
    AuditModule,
    AccountsModule,
    PeriodsModule,
    JournalModule,
    LedgerModule,
    ReportsModule,
    DocumentsModule,
  ],
  providers: [
    // AuthGuard runs before RolesGuard so request.user is populated by the time role
    // checks read it. Both run on every route unless @Public() opts out.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
