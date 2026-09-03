import { IsString, MaxLength, MinLength } from 'class-validator';

export class SuggestAccountDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description!: string;
}
