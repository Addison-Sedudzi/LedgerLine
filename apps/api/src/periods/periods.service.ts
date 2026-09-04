import { Injectable } from '@nestjs/common';
import { NotFoundError, ValidationError } from '../common/errors/domain-errors';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import { CreatePeriodDto } from './dto/create-period.dto';
import { PeriodRow, PeriodsRepository } from './periods.repository';

@Injectable()
export class PeriodsService {
  constructor(
    private readonly repo: PeriodsRepository,
    private readonly audit: AuditService,
    private readonly db: DatabaseService,
  ) {}

  async list(clientId: string): Promise<PeriodRow[]> {
    return this.repo.findAll(clientId);
  }

  async create(clientId: string, dto: CreatePeriodDto): Promise<PeriodRow> {
    if (dto.endDate <= dto.startDate) {
      throw new ValidationError('End date must be after the start date');
    }

    const existing = await this.repo.findByStartDate(clientId, dto.startDate);
    if (existing) {
      throw new ValidationError(`A period already starts on ${dto.startDate}`);
    }

    return this.repo.create(clientId, { name: dto.name, startDate: dto.startDate, endDate: dto.endDate });
  }

  async close(clientId: string, actorId: string, id: string): Promise<PeriodRow> {
    const period = await this.repo.findById(clientId, id);
    if (!period) throw new NotFoundError('Period', id);
    if (period.status !== 'OPEN') {
      throw new ValidationError(`Period "${period.name}" is already closed`);
    }

    const hasDrafts = await this.repo.hasDraftEntries(clientId, id);
    if (hasDrafts) {
      throw new ValidationError(
        `Period "${period.name}" still has draft journal entries. Post or delete each one before closing the period.`,
      );
    }

    return this.db.transaction(async (client) => {
      const closed = await this.repo.close(clientId, id, actorId, client);
      await this.audit.record(
        {
          actorId,
          clientId,
          action: 'CLOSE_PERIOD',
          entityType: 'fiscal_period',
          entityId: id,
          before: period,
          after: closed,
        },
        client,
      );
      return closed;
    });
  }
}
