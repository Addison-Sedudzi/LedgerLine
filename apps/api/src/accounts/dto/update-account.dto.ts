import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
