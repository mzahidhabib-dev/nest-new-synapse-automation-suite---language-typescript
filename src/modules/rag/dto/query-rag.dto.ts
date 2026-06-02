import { IsString, IsInt, IsOptional, Min, Max } from 'class-validator';

export class QueryRagDto {
  @IsString()
  query: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(20)
  topK?: number = 5;

  @IsString()
  @IsOptional()
  documentId?: string; // Optional: restrict search to a specific document

  @IsString()
  @IsOptional()
  sessionId?: string; // Optional: Session ID for conversation history
}
