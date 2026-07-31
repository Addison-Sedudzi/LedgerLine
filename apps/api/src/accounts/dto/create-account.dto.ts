import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { AccountType } from '@ledgerline/shared';

const ACCOUNT_TYPES: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];

export class CreateAccountDto {
  @IsString()
  @Matches(/^[A-Za-z0-9.-]+$/, { message: 'code may contain only letters, numbers, dots and hyphens' })
  @MaxLength(20)
  code!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsIn(ACCOUNT_TYPES)
  type!: AccountType;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsBoolean()
  isPostable?: boolean;
}
