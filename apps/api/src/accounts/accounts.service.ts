import { Injectable } from '@nestjs/common';
import { Account, AccountType, NormalBalance } from '@ledgerline/shared';
import { NotFoundError, ValidationError } from '../common/errors/domain-errors';
import { AccountsRepository, AccountRow } from './accounts.repository';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

// The database speaks snake_case, matching its column names; the API boundary speaks
// camelCase, matching the shared TypeScript types the frontend imports. See CLAUDE.md's
// "map at the repository boundary, not in the controller".
function toAccountDto(row: AccountRow): Account {
  return {
    id: row.id,
    clientId: row.client_id,
    code: row.code,
    name: row.name,
    type: row.type,
    normalBalance: row.normal_balance,
    parentId: row.parent_id,
    isPostable: row.is_postable,
    isActive: row.is_active,
  };
}

// ASSET and EXPENSE accounts increase with a debit; everything else increases with a
// credit. This is derived here, never supplied by the caller, so an account can never be
// created with a normal balance that contradicts its type.
function deriveNormalBalance(type: AccountType): NormalBalance {
  return type === 'ASSET' || type === 'EXPENSE' ? 'DEBIT' : 'CREDIT';
}

@Injectable()
export class AccountsService {
  constructor(private readonly repo: AccountsRepository) {}

  async list(clientId: string, filters: { type?: AccountType; active?: boolean }): Promise<Account[]> {
    const rows = await this.repo.findAll(clientId, filters);
    return rows.map(toAccountDto);
  }

  async getOne(clientId: string, id: string): Promise<Account> {
    const account = await this.repo.findById(clientId, id);
    if (!account) throw new NotFoundError('Account', id);
    return toAccountDto(account);
  }

  async getBalance(clientId: string, id: string, asAt: string) {
    const account = await this.getOne(clientId, id);
    const balance = await this.repo.balanceAsAt(clientId, id, asAt, account.normalBalance);
    return { accountId: id, asAt, balance };
  }

  async create(clientId: string, dto: CreateAccountDto): Promise<Account> {
    const existing = await this.repo.findByCode(clientId, dto.code);
    if (existing) {
      throw new ValidationError(`Account code "${dto.code}" is already in use for this client`);
    }

    if (dto.parentId) {
      const parent = await this.repo.findById(clientId, dto.parentId);
      if (!parent) throw new NotFoundError('Account', dto.parentId);
      if (parent.type !== dto.type) {
        throw new ValidationError('A sub-account must share its parent\'s account type');
      }
    }

    const account = await this.repo.create(clientId, {
      code: dto.code,
      name: dto.name,
      type: dto.type,
      normalBalance: deriveNormalBalance(dto.type),
      parentId: dto.parentId ?? null,
      isPostable: dto.isPostable ?? true,
    });

    // An account with children is not postable — only leaves take postings. Adding the
    // first child to a previously-leaf parent must retract its own postability.
    if (dto.parentId) {
      await this.repo.setPostable(clientId, dto.parentId, false);
    }

    return toAccountDto(account);
  }

  async update(clientId: string, id: string, dto: UpdateAccountDto): Promise<Account> {
    // Deactivating is always allowed, postings or not — it stops future use without
    // touching history. Type is not editable through this DTO at all: changing the type of
    // an account that already has postings would silently reinterpret its whole history,
    // so the only way to "change" a type is to deactivate the old account and create a new
    // one.
    await this.getOne(clientId, id);
    const updated = await this.repo.update(clientId, id, dto);
    return toAccountDto(updated);
  }

  async delete(clientId: string, id: string): Promise<void> {
    const account = await this.getOne(clientId, id);
    const hasPostings = await this.repo.hasPostings(clientId, id);
    if (hasPostings) {
      throw new ValidationError(
        `Account ${account.code} has postings against it and cannot be deleted. Deactivate it instead.`,
      );
    }
    const hasChildren = await this.repo.hasChildren(clientId, id);
    if (hasChildren) {
      throw new ValidationError(`Account ${account.code} has sub-accounts and cannot be deleted.`);
    }
    await this.repo.deleteById(clientId, id);
  }
}
