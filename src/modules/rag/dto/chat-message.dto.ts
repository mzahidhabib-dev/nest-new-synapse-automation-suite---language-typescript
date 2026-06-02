import { IsString, IsEnum, IsOptional } from 'class-validator';

export type MessageRole = 'user' | 'assistant';

export class ChatMessageDto {
  @IsEnum(['user', 'assistant'])
  role: MessageRole;

  @IsString()
  content: string;

  @IsString()
  @IsOptional()
  sessionId?: string;
}
