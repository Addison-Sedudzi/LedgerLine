import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AccountType } from '@ledgerline/shared';
import { ClientScopeGuard } from '../common/guards/client-scope.guard';
import { CurrentClientId } from '../common/decorators/current-client-id.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { SuggestAccountDto } from './dto/suggest-account.dto';

@Controller('accounts')
@UseGuards(ClientScopeGuard)
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  list(
    @CurrentClientId() clientId: string,
    @Query('type') type?: AccountType,
    @Query('active') active?: string,
  ) {
    return this.accounts.list(clientId, {
      type,
      active: active === undefined ? undefined : active === 'true',
    });
  }

  @Get(':id')
  getOne(@CurrentClientId() clientId: string, @Param('id') id: string) {
    return this.accounts.getOne(clientId, id);
  }

  @Get(':id/balance')
  getBalance(
    @CurrentClientId() clientId: string,
    @Param('id') id: string,
    @Query('asAt') asAt: string,
  ) {
    return this.accounts.getBalance(clientId, id, asAt ?? new Date().toISOString().slice(0, 10));
  }

  @Post()
  @Roles('admin')
  create(@CurrentClientId() clientId: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAccountDto) {
    return this.accounts.create(clientId, user.id, dto);
  }

  // No @Roles() — read-only, never creates or posts anything, so any client-scoped user
  // typing a journal entry can get a suggestion, not just admins.
  @Post('suggest')
  suggest(@CurrentClientId() clientId: string, @Body() dto: SuggestAccountDto) {
    return this.accounts.suggest(clientId, dto.description);
  }

  @Patch(':id')
  @Roles('admin')
  update(
    @CurrentClientId() clientId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.accounts.update(clientId, user.id, id, dto);
  }

  @Delete(':id')
  @Roles('admin')
  async delete(@CurrentClientId() clientId: string, @CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.accounts.delete(clientId, user.id, id);
    return { deleted: true };
  }
}
