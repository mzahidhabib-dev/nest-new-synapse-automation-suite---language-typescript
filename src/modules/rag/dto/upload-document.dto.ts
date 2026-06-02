import { IsString, IsOptional } from 'class-validator';

export class UploadDocumentDto {
  @IsString()
  @IsOptional()
  description?: string;
}
