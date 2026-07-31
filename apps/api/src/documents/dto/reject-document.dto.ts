import { IsString, MinLength } from 'class-validator';

export class RejectDocumentDto {
  @IsString()
  @MinLength(5)
  reason!: string;
}
