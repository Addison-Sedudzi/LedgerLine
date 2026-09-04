import { Injectable } from '@nestjs/common';
import { JournalEntrySource, JournalEntryStatus, Money } from '@ledgerline/shared';
import { DatabaseService } from '../database/database.service';
import { AccountsRepository } from '../accounts/accounts.repository';
import { PeriodsRepository } from '../periods/periods.repository';
import { AuditService } from '../audit/audit.service';
import {
  ImmutableEntryError,
  NotFoundError,
  PeriodClosedError,
  UnbalancedEntryError,
  ValidationError,
} from '../common/errors/domain-errors';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { JournalRepository, JournalLineInput, JournalEntryRow, JournalLineRow } from './journal.repository';
import { CreateJournalEntryDto, JournalLineDto } from './dto/create-journal-entry.dto';
import { UpdateJournalEntryDto } from './dto/update-journal-entry.dto';

@Injectable()
export class JournalService {
  constructor(
    private readonly db: DatabaseService,
    private readonly journal: JournalRepository,
    private readonly accounts: AccountsRepository,
    private readonly periods: PeriodsRepository,
    private readonly audit: AuditService,
  ) {}

  // Shared by create and update. Every rule here is checked again, unconditionally, at
  // posting time in post() — this pass only stops obviously broken data from ever being
  // saved as a draft.
  private async validateAndBuildLines(
    clientId: string,
    periodId: string,
    entryDate: string,
    dtoLines: JournalLineDto[],
  ): Promise<JournalLineInput[]> {
    if (dtoLines.length < 2) {
      throw new ValidationError('A journal entry needs at least two lines');
    }

    const period = await this.periods.findById(clientId, periodId);
    if (!period) throw new NotFoundError('Period', periodId);
    // A closed period rejects all writes (CLAUDE.md rule 6), not just posting — a draft is
    // still a write, and the whole point of closing a period is that it stops changing.
    if (period.status !== 'OPEN') throw new PeriodClosedError(period.name);
    if (entryDate < period.start_date || entryDate > period.end_date) {
      throw new ValidationError(
        `Entry date ${entryDate} falls outside period "${period.name}" (${period.start_date} to ${period.end_date})`,
      );
    }

    const built: JournalLineInput[] = [];
    let totalDebit = Money.zero();
    let totalCredit = Money.zero();

    for (const line of dtoLines) {
      const debitValue = Money.of(line.debit && line.debit.trim() !== '' ? line.debit : '0');
      const creditValue = Money.of(line.credit && line.credit.trim() !== '' ? line.credit : '0');

      if (debitValue.isNegative() || creditValue.isNegative()) {
        throw new ValidationError('A line amount cannot be negative');
      }

      const hasDebit = debitValue.isPositive();
      const hasCredit = creditValue.isPositive();
      if (hasDebit === hasCredit) {
        throw new ValidationError(
          'Each line must carry an amount in exactly one of debit or credit, never both and never neither',
        );
      }

      const account = await this.accounts.findById(clientId, line.accountId);
      if (!account) throw new NotFoundError('Account', line.accountId);
      if (!account.is_active) throw new ValidationError(`Account ${account.code} is not active`);
      if (!account.is_postable) {
        throw new ValidationError(`Account ${account.code} is not postable — it has sub-accounts`);
      }

      totalDebit = totalDebit.add(debitValue);
      totalCredit = totalCredit.add(creditValue);

      built.push({
        accountId: line.accountId,
        debit: debitValue.toString(),
        credit: creditValue.toString(),
        description: line.description ?? null,
      });
    }

    if (!totalDebit.equals(totalCredit)) {
      throw new UnbalancedEntryError(totalDebit.toString(), totalCredit.toString());
    }

    return built;
  }

  async createDraft(clientId: string, user: AuthenticatedUser, dto: CreateJournalEntryDto) {
    const lines = await this.validateAndBuildLines(clientId, dto.periodId, dto.entryDate, dto.lines);

    const entry = await this.db.transaction(async (client) => {
      const header = await this.journal.insertEntry(client, {
        clientId,
        periodId: dto.periodId,
        entryDate: dto.entryDate,
        narration: dto.narration,
        source: dto.source ?? 'MANUAL',
        createdBy: user.id,
      });
      await this.journal.insertLines(client, header.id, lines);
      await this.audit.record(
        {
          actorId: user.id,
          clientId,
          action: 'CREATE',
          entityType: 'journal_entry',
          entityId: header.id,
          after: { ...header, lines },
        },
        client,
      );
      return header;
    });

    return this.getOne(clientId, entry.id);
  }

  // The database and its repositories speak snake_case, matching the SQL column names
  // exactly, so the schema itself stays readable. The API boundary speaks camelCase, matching
  // the shared TypeScript types the frontend imports. This is the mapping between them —
  // see CLAUDE.md's "map at the repository boundary, not in the controller".
  private toEntryDto(entry: JournalEntryRow, lines: JournalLineRow[]) {
    return {
      id: entry.id,
      clientId: entry.client_id,
      periodId: entry.period_id,
      entryNo: entry.entry_no !== null ? Number(entry.entry_no) : null,
      entryDate: entry.entry_date,
      narration: entry.narration,
      source: entry.source,
      status: entry.status,
      reversesEntryId: entry.reverses_entry_id,
      createdBy: entry.created_by,
      createdAt: entry.created_at,
      postedBy: entry.posted_by,
      postedAt: entry.posted_at,
      lines: lines.map((l) => ({
        id: l.id,
        entryId: l.entry_id,
        lineNo: l.line_no,
        accountId: l.account_id,
        accountCode: l.account_code,
        accountName: l.account_name,
        debit: l.debit,
        credit: l.credit,
        description: l.description,
      })),
    };
  }

  async getOne(clientId: string, id: string) {
    const entry = await this.journal.findById(clientId, id);
    if (!entry) throw new NotFoundError('Journal entry', id);
    const lines = await this.journal.findLines(id);
    return this.toEntryDto(entry, lines);
  }

  async list(
    clientId: string,
    filters: {
      periodId?: string;
      from?: string;
      to?: string;
      accountId?: string;
      status?: JournalEntryStatus;
      source?: JournalEntrySource;
      search?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    return this.journal.list(clientId, {
      ...filters,
      page: filters.page ?? 1,
      pageSize: filters.pageSize ?? 50,
    });
  }

  async update(clientId: string, user: AuthenticatedUser, id: string, dto: UpdateJournalEntryDto) {
    const existing = await this.getOne(clientId, id);
    if (existing.status !== 'DRAFT') {
      throw new ImmutableEntryError(id, 'is not a draft');
    }

    const periodId = dto.periodId ?? existing.periodId;
    const entryDate = dto.entryDate ?? existing.entryDate;
    const lineDtos = dto.lines ?? existing.lines.map((l) => ({
      accountId: l.accountId,
      debit: l.debit,
      credit: l.credit,
      description: l.description ?? undefined,
    }));
    const lines = await this.validateAndBuildLines(clientId, periodId, entryDate, lineDtos);

    await this.db.transaction(async (client) => {
      if (dto.periodId || dto.entryDate || dto.narration || dto.source) {
        await client.query(
          `UPDATE journal_entries SET period_id = $2, entry_date = $3, narration = $4, source = $5 WHERE id = $1`,
          [id, periodId, entryDate, dto.narration ?? existing.narration, dto.source ?? existing.source],
        );
      }
      await this.journal.replaceLines(client, id, lines);
      await this.audit.record(
        {
          actorId: user.id,
          clientId,
          action: 'UPDATE',
          entityType: 'journal_entry',
          entityId: id,
          before: existing,
          after: { ...existing, periodId, entryDate, lines },
        },
        client,
      );
    });

    return this.getOne(clientId, id);
  }

  async remove(clientId: string, id: string): Promise<void> {
    const existing = await this.getOne(clientId, id);
    if (existing.status !== 'DRAFT') {
      throw new ImmutableEntryError(id, 'is not a draft');
    }
    const period = await this.periods.findById(clientId, existing.periodId);
    if (period && period.status !== 'OPEN') throw new PeriodClosedError(period.name);
    await this.db.transaction(async (client) => {
      await this.journal.deleteEntry(client, clientId, id);
    });
  }

  async post(clientId: string, user: AuthenticatedUser, id: string) {
    return this.db.transaction(async (client) => {
      const entry = await this.journal.lockById(client, clientId, id);
      if (!entry) throw new NotFoundError('Journal entry', id);

      if (entry.status === 'POSTED') throw new ImmutableEntryError(id, 'has already been posted');
      if (entry.status === 'REVERSED') throw new ImmutableEntryError(id, 'has been reversed');

      const period = await this.periods.findById(clientId, entry.period_id, client);
      if (!period) throw new NotFoundError('Period', entry.period_id);
      if (period.status !== 'OPEN') throw new PeriodClosedError(period.name);

      // Never trust that debits equal credits, or that every line's account is still valid
      // to post to, because that was checked at draft creation — the accounts or the period
      // may have changed since (an account can be deactivated, or gain a sub-account and
      // lose postability, while a draft referencing it sits unposted). Re-verify both
      // against the database, not the draft's own stale assumption.
      const lines = await this.journal.findLines(id, client);
      for (const line of lines) {
        if (!line.account_is_active) {
          throw new ValidationError(`Account ${line.account_code} — ${line.account_name} is not active and cannot be posted to`);
        }
        if (!line.account_is_postable) {
          throw new ValidationError(`Account ${line.account_code} — ${line.account_name} is not postable — it has sub-accounts`);
        }
      }
      const totalDebit = lines.reduce((t, l) => t.add(l.debit), Money.zero());
      const totalCredit = lines.reduce((t, l) => t.add(l.credit), Money.zero());
      if (!totalDebit.equals(totalCredit)) {
        throw new UnbalancedEntryError(totalDebit.toString(), totalCredit.toString());
      }

      const entryNo = await this.journal.nextEntryNo(client, clientId);
      const posted = await this.journal.markPosted(client, id, entryNo, user.id);

      await this.audit.record(
        {
          actorId: user.id,
          clientId,
          action: 'POST',
          entityType: 'journal_entry',
          entityId: id,
          before: entry,
          after: posted,
        },
        client,
      );

      return this.toEntryDto(posted, lines);
    });
  }

  async reverse(clientId: string, user: AuthenticatedUser, id: string, reversalDate?: string) {
    return this.db.transaction(async (client) => {
      const original = await this.journal.lockById(client, clientId, id);
      if (!original) throw new NotFoundError('Journal entry', id);
      if (original.status === 'DRAFT') {
        throw new ValidationError('Only a posted entry can be reversed');
      }
      if (original.status === 'REVERSED') {
        throw new ImmutableEntryError(id, 'has already been reversed');
      }

      const alreadyReversedBy = await client.query(
        'SELECT id FROM journal_entries WHERE reverses_entry_id = $1',
        [id],
      );
      if (alreadyReversedBy.rows.length > 0) {
        throw new ImmutableEntryError(id, 'has already been reversed');
      }

      const date = reversalDate ?? original.entry_date;
      const period = await this.periods.findContainingDate(clientId, date, client);
      if (!period) {
        throw new ValidationError(`No fiscal period covers ${date}; cannot post a reversal there`);
      }
      if (period.status !== 'OPEN') {
        throw new PeriodClosedError(period.name);
      }

      const originalLines = await this.journal.findLines(id, client);
      const mirrored: JournalLineInput[] = originalLines.map((l) => ({
        accountId: l.account_id,
        debit: l.credit,
        credit: l.debit,
        description: l.description,
      }));

      const reversal = await this.journal.insertEntry(client, {
        clientId,
        periodId: period.id,
        entryDate: date,
        narration: `Reversal of entry ${original.entry_no}${original.narration ? ` — ${original.narration}` : ''}`,
        source: original.source,
        createdBy: user.id,
        reversesEntryId: original.id,
      });
      await this.journal.insertLines(client, reversal.id, mirrored);

      const entryNo = await this.journal.nextEntryNo(client, clientId);
      const postedReversal = await this.journal.markPosted(client, reversal.id, entryNo, user.id);
      await this.journal.markReversed(client, id);
      const reversalLines = await this.journal.findLines(reversal.id, client);

      await this.audit.record(
        {
          actorId: user.id,
          clientId,
          action: 'REVERSE',
          entityType: 'journal_entry',
          entityId: id,
          before: original,
          after: { reversedBy: postedReversal.id },
        },
        client,
      );

      return this.toEntryDto(postedReversal, reversalLines);
    });
  }
}
