import { IsDateString, IsString, MaxLength } from 'class-validator';

export class CreatePeriodDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;
}
