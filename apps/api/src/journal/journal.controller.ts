import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JournalEntrySource, JournalEntryStatus } from '@ledgerline/shared';
import { ClientScopeGuard } from '../common/guards/client-scope.guard';
import { CurrentClientId } from '../common/decorators/current-client-id.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { JournalService } from './journal.service';
import { CreateJournalEntryDto } from './dto/create-journal-entry.dto';
import { UpdateJournalEntryDto } from './dto/update-journal-entry.dto';
import { ReverseJournalEntryDto } from './dto/reverse-journal-entry.dto';

@Controller('journal-entries')
@UseGuards(ClientScopeGuard)
export class JournalController {
  constructor(private readonly journal: JournalService) {}

  @Get()
  list(
    @CurrentClientId() clientId: string,
    @Query('periodId') periodId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('accountId') accountId?: string,
    @Query('status') status?: JournalEntryStatus,
    @Query('source') source?: JournalEntrySource,
    @Query('search') search?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
  ) {
    return this.journal.list(clientId, {
      periodId,
      from,
      to,
      accountId,
      status,
      source,
      search,
      page: Number(page),
      pageSize: Number(pageSize),
    });
  }

  @Get(':id')
  getOne(@CurrentClientId() clientId: string, @Param('id') id: string) {
    return this.journal.getOne(clientId, id);
  }

  @Post()
  create(
    @CurrentClientId() clientId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateJournalEntryDto,
  ) {
    return this.journal.createDraft(clientId, user, dto);
  }

  @Patch(':id')
  update(
    @CurrentClientId() clientId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateJournalEntryDto,
  ) {
    return this.journal.update(clientId, user, id, dto);
  }

  @Delete(':id')
  async remove(@CurrentClientId() clientId: string, @Param('id') id: string) {
    await this.journal.remove(clientId, id);
    return { deleted: true };
  }

  @Post(':id/post')
  @Roles('reviewer', 'admin')
  post(
    @CurrentClientId() clientId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.journal.post(clientId, user, id);
  }

  @Post(':id/reverse')
  @Roles('reviewer', 'admin')
  reverse(
    @CurrentClientId() clientId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReverseJournalEntryDto,
  ) {
    return this.journal.reverse(clientId, user, id, dto.reversalDate);
  }
}
