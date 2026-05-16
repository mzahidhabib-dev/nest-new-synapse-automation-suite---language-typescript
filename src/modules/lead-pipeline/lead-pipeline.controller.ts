// src/lead-pipeline/lead-pipeline.controller.ts
import { 
  Controller, 
  Post, 
  Body, 
  HttpCode, 
  HttpStatus, 
  UsePipes, 
  ValidationPipe 
} from '@nestjs/common';
import { LeadAnalyzerChainService } from './chains/lead-analyzer-chain.service';
import { LeadRequestDto } from './dto/lead-request.dto';

/**
 * Controller handling inbound webhook requests from n8n automations.
 * Route: POST /lead/process
 */
@Controller('lead')
export class LeadPipelineController {
  constructor(private readonly leadAnalyzerService: LeadAnalyzerChainService) {}

  /**
   * Primary pipeline trigger endpoint.
   * * @param body The validated incoming JSON payload defined by LeadRequestDto.
   * @returns A clean, flat JSON object designed for immediate n8n routing.
   */
  @Post('process')
  @HttpCode(HttpStatus.OK) // Explicitly return 200 OK instead of Nest's default 201 Created, as this is a processing pipeline
  @UsePipes(new ValidationPipe({ 
    whitelist: true,        // Security: Strips any unexpected properties not defined in the DTO
    forbidNonWhitelisted: true, // Security: Rejects requests containing malicious extra fields
    transform: true         // Automatically transforms payloads to match the DTO class
  }))
  async processLeadWebhook(@Body() body: LeadRequestDto) {
    // Because of the ValidationPipe and DTO, we mathematically guarantee that 
    // body.emailText exists, is a string, and is safely between 10 and 8000 characters
    // before it ever touches our LLM billing cycles.
    
    return await this.leadAnalyzerService.processLeadPipeline(body.emailText);
  }
}