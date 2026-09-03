import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { JournalEntrySource } from '@ledgerline/shared';

const SOURCES: JournalEntrySource[] = [
  'MANUAL',
  'SALES',
  'PURCHASE',
  'CASH',
  'ADJUSTMENT',
  'CLOSING',
  'DOCUMENT',
];

export class JournalLineDto {
  @IsUUID()
  accountId!: string;

  // Decimal strings, never numbers — see packages/shared/src/money.ts for why.
  @IsOptional()
  @IsString()
  debit?: string;

  @IsOptional()
  @IsString()
  credit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class CreateJournalEntryDto {
  @IsUUID()
  periodId!: string;

  @IsDateString()
  entryDate!: string;

  @IsString()
  @IsNotEmpty({ message: 'A narration is required' })
  @MaxLength(500)
  narration!: string;

  @IsOptional()
  @IsIn(SOURCES)
  source?: JournalEntrySource;

  @IsArray()
  @ArrayMinSize(2, { message: 'A journal entry needs at least two lines' })
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines!: JournalLineDto[];
}
