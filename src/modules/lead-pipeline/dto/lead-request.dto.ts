// src/lead-pipeline/dto/lead-request.dto.ts
import { IsString, MinLength, MaxLength, IsOptional } from 'class-validator';

/**
 * LEAD REQUEST DTO
 * Validates incoming payloads sent from n8n automation nodes or webhooks.
 * Uses class-validator to handle pre-routing runtime security checks.
 */
export class LeadRequestDto {
  @IsString({ message: 'The email body text must be a valid string.' })
  @MinLength(10, { message: 'The incoming email is too short to extract lead information (minimum 10 characters).' })
  @MaxLength(8000, { message: 'The incoming email text exceeds the maximum safe processing size of 8000 characters.' })
  emailText: string;

  @IsString({ message: 'The lead source metadata must be a string.' })
  @IsOptional()
  @MaxLength(100, { message: 'The source metadata name is too long.' })
  source?: string; // Optional metadata to track origins like 'gmail_inbox', 'contact_form', or 'linkedin'
}