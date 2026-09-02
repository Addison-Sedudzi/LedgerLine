import { Injectable } from '@nestjs/common';
import { ValidationError } from '../common/errors/domain-errors';
import { CreatePeriodDto } from './dto/create-period.dto';
import { PeriodRow, PeriodsRepository } from './periods.repository';

@Injectable()
export class PeriodsService {
  constructor(private readonly repo: PeriodsRepository) {}

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
}
