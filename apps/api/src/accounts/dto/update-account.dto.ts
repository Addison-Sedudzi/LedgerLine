import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { AccountSubtype, AccountType } from '@ledgerline/shared';

const ALL_SUBTYPES: AccountSubtype[] = [
  'CURRENT_ASSET',
  'NON_CURRENT_ASSET',
  'CURRENT_LIABILITY',
  'NON_CURRENT_LIABILITY',
  'COST_OF_SALES',
  'OPERATING_EXPENSE',
];

const ACCOUNT_TYPES: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // Only actually applied by the service if the account has zero postings — see
  // AccountsService.update. Present here so a genuine mistake can be corrected directly
  // instead of needing a database migration.
  @IsOptional()
  @IsIn(ACCOUNT_TYPES)
  type?: AccountType;

  // Validated against the account's own type (or the new type, if both are supplied
  // together) in the service — this DTO only knows the full set of values across every type.
  @IsOptional()
  @IsIn(ALL_SUBTYPES)
  subtype?: AccountSubtype;
}
