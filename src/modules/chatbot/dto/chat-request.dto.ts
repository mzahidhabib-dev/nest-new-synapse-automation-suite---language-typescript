import { IsString, IsNotEmpty, IsOptional, IsEmail } from 'class-validator';

export class ChatRequestDto {
  @IsString()
  @IsNotEmpty()
  message: string;

  @IsEmail()
  @IsNotEmpty() // We make this mandatory for Option B so we can track memory
  email: string; 
}