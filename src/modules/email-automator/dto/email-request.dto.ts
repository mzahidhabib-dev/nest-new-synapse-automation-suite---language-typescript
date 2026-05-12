// dto/email-request.dto.ts
import { IsString, MinLength, MaxLength } from 'class-validator';

export class EmailRequestDto {
  @IsString()
  @MinLength(5)
  @MaxLength(5000)
  emailText: string;
}