import { IsIn, IsString, MaxLength } from 'class-validator';
import { AccountType } from '@ledgerline/shared';

const ACCOUNT_TYPES: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];

export class FindOrCreateAccountDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  // Only used if no account with this name already exists — an existing account is
  // returned as-is regardless of which type button was clicked to find it.
  @IsIn(ACCOUNT_TYPES)
  type!: AccountType;
}
