import { IsDateString, IsOptional } from 'class-validator';

export class ReverseJournalEntryDto {
  @IsOptional()
  @IsDateString()
  reversalDate?: string;
}
