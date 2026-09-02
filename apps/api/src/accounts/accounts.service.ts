import { Injectable } from '@nestjs/common';
import { Account, AccountSubtype, AccountType, NormalBalance } from '@ledgerline/shared';
import { NotFoundError, ValidationError } from '../common/errors/domain-errors';
import { AccountsRepository, AccountRow } from './accounts.repository';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { FindOrCreateAccountDto } from './dto/find-or-create-account.dto';

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
    description: row.description,
    subtype: row.subtype,
  };
}

// ASSET and EXPENSE accounts increase with a debit; everything else increases with a
// credit. This is derived here, never supplied by the caller, so an account can never be
// created with a normal balance that contradicts its type.
function deriveNormalBalance(type: AccountType): NormalBalance {
  return type === 'ASSET' || type === 'EXPENSE' ? 'DEBIT' : 'CREDIT';
}

// The numbering convention this project's own seed chart of accounts uses: each type gets
// its own thousand-block, so a code alone tells you what kind of account it is.
const TYPE_CODE_BASE: Record<AccountType, number> = {
  ASSET: 1000,
  LIABILITY: 2000,
  EQUITY: 3000,
  INCOME: 4000,
  EXPENSE: 5000,
};

// Mirrors the accounts_subtype_matches_type CHECK constraint — the service validates this
// before the database ever has to reject a mismatched pair. INCOME and EQUITY have no
// subtype in this build.
const SUBTYPES_BY_TYPE: Record<AccountType, AccountSubtype[]> = {
  ASSET: ['CURRENT_ASSET', 'NON_CURRENT_ASSET'],
  LIABILITY: ['CURRENT_LIABILITY', 'NON_CURRENT_LIABILITY'],
  EQUITY: [],
  INCOME: [],
  EXPENSE: ['COST_OF_SALES', 'OPERATING_EXPENSE'],
};

// The common case for a freshly created account of each type — editable afterward on the
// Chart of Accounts page. New expense accounts default to operating, never cost of sales:
// gross profit only appears on a statement once the bookkeeper deliberately reclassifies
// one, never because of an assumption made at creation time.
function defaultSubtype(type: AccountType): AccountSubtype | null {
  if (type === 'ASSET') return 'CURRENT_ASSET';
  if (type === 'LIABILITY') return 'CURRENT_LIABILITY';
  if (type === 'EXPENSE') return 'OPERATING_EXPENSE';
  return null;
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

  // Finds the next free code in the type's numbering block: one past the highest existing
  // code of that type (active or not, so a deactivated account's number is never reused),
  // or the block's starting number if this is the first account of that type.
  private async nextCode(clientId: string, type: AccountType): Promise<string> {
    const base = TYPE_CODE_BASE[type];
    const accountsOfType = await this.repo.findAll(clientId, { type });
    const numericCodes = accountsOfType
      .map((a) => Number(a.code))
      .filter((n) => Number.isFinite(n) && n >= base && n < base + 1000);
    const next = numericCodes.length === 0 ? base : Math.max(...numericCodes) + 10;
    return String(next);
  }

  async create(clientId: string, dto: CreateAccountDto): Promise<Account> {
    const code = dto.code ?? (await this.nextCode(clientId, dto.type));

    const existing = await this.repo.findByCode(clientId, code);
    if (existing) {
      throw new ValidationError(`Account code "${code}" is already in use for this client`);
    }

    if (dto.parentId) {
      const parent = await this.repo.findById(clientId, dto.parentId);
      if (!parent) throw new NotFoundError('Account', dto.parentId);
      if (parent.type !== dto.type) {
        throw new ValidationError('A sub-account must share its parent\'s account type');
      }
    }

    const account = await this.repo.create(clientId, {
      code,
      name: dto.name,
      type: dto.type,
      normalBalance: deriveNormalBalance(dto.type),
      parentId: dto.parentId ?? null,
      isPostable: dto.isPostable ?? true,
      description: dto.description ?? null,
      subtype: defaultSubtype(dto.type),
    });

    // An account with children is not postable — only leaves take postings. Adding the
    // first child to a previously-leaf parent must retract its own postability.
    if (dto.parentId) {
      await this.repo.setPostable(clientId, dto.parentId, false);
    }

    return toAccountDto(account);
  }

  // Used by the journal entry form's free-text account field: a name that already exists
  // resolves straight to that account (whatever type button was clicked is ignored — an
  // existing account's type is never silently reinterpreted), and a name that doesn't
  // exist yet is created on the spot with a server-assigned code, exactly like create()
  // does when no code is supplied.
  async findOrCreate(clientId: string, dto: FindOrCreateAccountDto): Promise<Account> {
    const existing = await this.repo.findByName(clientId, dto.name);
    if (existing) return toAccountDto(existing);

    const code = await this.nextCode(clientId, dto.type);
    const account = await this.repo.create(clientId, {
      code,
      name: dto.name,
      type: dto.type,
      normalBalance: deriveNormalBalance(dto.type),
      parentId: null,
      isPostable: true,
      description: null,
      subtype: defaultSubtype(dto.type),
    });
    return toAccountDto(account);
  }

  async update(clientId: string, id: string, dto: UpdateAccountDto): Promise<Account> {
    // Deactivating is always allowed, postings or not — it stops future use without
    // touching history. Type is not editable through this DTO at all: changing the type of
    // an account that already has postings would silently reinterpret its whole history,
    // so the only way to "change" a type is to deactivate the old account and create a new
    // one.
    const existing = await this.getOne(clientId, id);
    if (dto.subtype !== undefined && !SUBTYPES_BY_TYPE[existing.type].includes(dto.subtype)) {
      throw new ValidationError(
        `"${dto.subtype}" is not a valid subtype for a ${existing.type} account`,
      );
    }
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
