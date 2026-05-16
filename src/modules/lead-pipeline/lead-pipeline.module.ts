// src/lead-pipeline/lead-pipeline.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Internal domain imports
import { LeadPipelineController } from './lead-pipeline.controller';
import { LeadAnalyzerChainService } from './chains/lead-analyzer-chain.service';
import { LeadProcessingLog } from './entity/lead-processing-log.entity';

// External domain imports (Adjust this path if your LLM module is located elsewhere)
import { LlmModule } from '../llm/llm.module';

/**
 * The Lead Pipeline Module.
 * Encapsulates the entire B2B webhook intake, LLM evaluation chain, and database logging.
 */
@Module({
  imports: [
    // Imports the global LLM connection (Gemini/Groq SDKs)
    LlmModule, 
    
    // Registers the optimized jsonb/uuid entity with the active PostgreSQL connection
    TypeOrmModule.forFeature([LeadProcessingLog]) 
  ],
  controllers: [LeadPipelineController],
  providers: [LeadAnalyzerChainService],
  
  // Export the service just in case a future module (like a CRON job module) needs to trigger pipeline evaluations natively
  exports: [LeadAnalyzerChainService], 
})
export class LeadPipelineModule {}