import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { AccountSubtype } from '@ledgerline/shared';

const ALL_SUBTYPES: AccountSubtype[] = [
  'CURRENT_ASSET',
  'NON_CURRENT_ASSET',
  'CURRENT_LIABILITY',
  'NON_CURRENT_LIABILITY',
  'COST_OF_SALES',
  'OPERATING_EXPENSE',
];

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // Validated against the account's own type in the service — this DTO only knows the
  // full set of values across every type.
  @IsOptional()
  @IsIn(ALL_SUBTYPES)
  subtype?: AccountSubtype;
}
