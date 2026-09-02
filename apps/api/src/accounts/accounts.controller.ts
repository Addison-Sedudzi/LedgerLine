import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AccountType } from '@ledgerline/shared';
import { ClientScopeGuard } from '../common/guards/client-scope.guard';
import { CurrentClientId } from '../common/decorators/current-client-id.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { FindOrCreateAccountDto } from './dto/find-or-create-account.dto';

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
  create(@CurrentClientId() clientId: string, @Body() dto: CreateAccountDto) {
    return this.accounts.create(clientId, dto);
  }

  // Used by the journal entry form's free-text account field. Same admin-only restriction
  // as create() — this still creates accounts, just via a name lookup instead of a code.
  @Post('find-or-create')
  @Roles('admin')
  findOrCreate(@CurrentClientId() clientId: string, @Body() dto: FindOrCreateAccountDto) {
    return this.accounts.findOrCreate(clientId, dto);
  }

  @Patch(':id')
  @Roles('admin')
  update(@CurrentClientId() clientId: string, @Param('id') id: string, @Body() dto: UpdateAccountDto) {
    return this.accounts.update(clientId, id, dto);
  }

  @Delete(':id')
  @Roles('admin')
  async delete(@CurrentClientId() clientId: string, @Param('id') id: string) {
    await this.accounts.delete(clientId, id);
    return { deleted: true };
  }
}
