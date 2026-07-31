import { IsDateString, IsString, IsUUID, MaxLength } from 'class-validator';

export class ApproveDocumentDto {
  @IsUUID()
  expenseAccountId!: string;

  @IsUUID()
  paymentAccountId!: string;

  @IsString()
  amount!: string;

  @IsDateString()
  entryDate!: string;

  @IsString()
  @MaxLength(500)
  narration!: string;
}
