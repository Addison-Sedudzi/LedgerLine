import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateClientDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  businessType?: string;
}
