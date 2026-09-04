import { Injectable, Logger } from '@nestjs/common';
import { Account, AccountSubtype, AccountType, Confidence, NormalBalance } from '@ledgerline/shared';
import { NotFoundError, ValidationError } from '../common/errors/domain-errors';
import { AiService } from '../intelligence/ai.service';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
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
  private readonly logger = new Logger('AccountsService');

  constructor(
    private readonly repo: AccountsRepository,
    private readonly ai: AiService,
    private readonly audit: AuditService,
    private readonly db: DatabaseService,
  ) {}

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

  async create(clientId: string, actorId: string, dto: CreateAccountDto): Promise<Account> {
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

    return this.db.transaction(async (client) => {
      const account = await this.repo.create(
        clientId,
        {
          code,
          name: dto.name,
          type: dto.type,
          normalBalance: deriveNormalBalance(dto.type),
          parentId: dto.parentId ?? null,
          isPostable: dto.isPostable ?? true,
          description: dto.description ?? null,
          subtype: defaultSubtype(dto.type),
        },
        client,
      );

      // An account with children is not postable — only leaves take postings. Adding the
      // first child to a previously-leaf parent must retract its own postability.
      if (dto.parentId) {
        await this.repo.setPostable(clientId, dto.parentId, false, client);
      }

      const after = toAccountDto(account);
      await this.audit.record(
        { actorId, clientId, action: 'CREATE', entityType: 'account', entityId: account.id, after },
        client,
      );

      return after;
    });
  }

  async update(clientId: string, actorId: string, id: string, dto: UpdateAccountDto): Promise<Account> {
    // Deactivating is always allowed, postings or not — it stops future use without
    // touching history. Renaming is always allowed too — a label change never reinterprets
    // arithmetic. Type is different: changing it after the account has real postings would
    // silently reinterpret that history (an EXPENSE line quietly becoming an ASSET line),
    // so it is only ever allowed while the account has zero postings — the same guard
    // delete() already uses for the same reason. Caught early, a wrong-type mistake is
    // fixed by editing it directly; caught late, the only honest fix is to deactivate the
    // mistaken account and post correctly to a new one from here on.
    const existing = await this.getOne(clientId, id);
    const targetType = dto.type ?? existing.type;

    if (dto.subtype !== undefined && !SUBTYPES_BY_TYPE[targetType].includes(dto.subtype)) {
      throw new ValidationError(`"${dto.subtype}" is not a valid subtype for a ${targetType} account`);
    }

    const patch: Parameters<AccountsRepository['update']>[2] = {
      name: dto.name,
      isActive: dto.isActive,
      subtype: dto.subtype,
    };

    if (dto.type !== undefined && dto.type !== existing.type) {
      const hasPostings = await this.repo.hasPostings(clientId, id);
      if (hasPostings) {
        throw new ValidationError(
          `Account ${existing.code} has postings against it and its type cannot be changed. ` +
            `Deactivate it and post to a new account instead.`,
        );
      }
      patch.type = dto.type;
      patch.normalBalance = deriveNormalBalance(dto.type);
      // The old code belongs to the old type's numbering block and would be misleading
      // sitting under the new type — reassigned the same way a brand new account gets one.
      patch.code = await this.nextCode(clientId, dto.type);
      // A subtype the caller supplied for the new type is already validated above and
      // takes precedence; otherwise fall back to that type's sensible default rather than
      // silently keeping a subtype that belongs to the old type.
      if (dto.subtype === undefined) {
        patch.subtype = defaultSubtype(dto.type);
      }
    }

    return this.db.transaction(async (client) => {
      const updated = await this.repo.update(clientId, id, patch, client);
      const after = toAccountDto(updated);
      await this.audit.record(
        {
          actorId,
          clientId,
          action: 'UPDATE',
          entityType: 'account',
          entityId: id,
          before: existing,
          after,
        },
        client,
      );
      return after;
    });
  }

  async delete(clientId: string, actorId: string, id: string): Promise<void> {
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
    await this.db.transaction(async (client) => {
      await this.repo.deleteById(clientId, id, client);
      await this.audit.record(
        {
          actorId,
          clientId,
          action: 'DELETE',
          entityType: 'account',
          entityId: id,
          before: account,
        },
        client,
      );
    });
  }

  // Backs the ghost account suggestion on the journal entry form. Never creates or changes
  // anything — a pure read that offers a name for the bookkeeper to accept with Tab or
  // ignore entirely. Cached by client + normalised description first, so the same typed
  // word (e.g. "fuel") never reaches the AI twice; falls through to a real call only on a
  // genuine cache miss, and only if a key is configured.
  async suggest(clientId: string, description: string): Promise<{ accountId: string | null; accountName: string | null; confidence: Confidence | null }> {
    const key = description.trim().toLowerCase();
    if (!key) return { accountId: null, accountName: null, confidence: null };

    const cached = await this.repo.findCachedSuggestion(clientId, key);
    if (cached) {
      if (!cached.account_id) return { accountId: null, accountName: null, confidence: null };
      const account = await this.repo.findById(clientId, cached.account_id);
      // The cached account may since have been deactivated or deleted — a stale hit is
      // treated as no suggestion rather than offering something no longer valid.
      if (!account || !account.is_active || !account.is_postable) {
        return { accountId: null, accountName: null, confidence: null };
      }
      return { accountId: account.id, accountName: account.name, confidence: cached.confidence };
    }

    if (!this.ai.isConfigured) return { accountId: null, accountName: null, confidence: null };

    const candidates = (await this.repo.findAll(clientId, { active: true })).filter((a) => a.is_postable);
    if (candidates.length === 0) return { accountId: null, accountName: null, confidence: null };

    const system = `You are suggesting the single most likely account for a line in a
Ghanaian bookkeeping practice's journal entry, from a short free-text description the
bookkeeper is still typing. Reply with JSON only, no prose, in this exact shape:
{ "accountId": string | null, "confidence": "high" | "medium" | "low" }
Pick accountId from the provided list of account ids only, or null if nothing fits well.`;
    const userText = JSON.stringify({
      description,
      accounts: candidates.map((a) => ({ id: a.id, name: a.name, type: a.type })),
    });

    let accountId: string | null = null;
    let confidence: Confidence | null = null;
    try {
      const result = await this.ai.messages({
        system,
        userText,
        tier: 'fast',
        maxTokens: 150,
        timeoutMs: 8000,
        purpose: 'account_suggestion',
        clientId,
      });
      const parsed = JSON.parse(this.stripCodeFence(result.text)) as { accountId: string | null; confidence: Confidence };
      // Never trust an id the model invents — only one from the list actually offered.
      const match = parsed.accountId ? candidates.find((a) => a.id === parsed.accountId) : undefined;
      if (match) {
        accountId = match.id;
        confidence = parsed.confidence;
      }
    } catch (err) {
      this.logger.warn(`Account suggestion failed: ${(err as Error).message}`);
    }

    await this.repo.cacheSuggestion(clientId, key, accountId, confidence);
    const account = accountId ? candidates.find((a) => a.id === accountId) : undefined;
    return { accountId, accountName: account?.name ?? null, confidence };
  }

  private stripCodeFence(text: string): string {
    const trimmed = text.trim();
    if (trimmed.startsWith('```')) {
      return trimmed.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();
    }
    return trimmed;
  }
}
