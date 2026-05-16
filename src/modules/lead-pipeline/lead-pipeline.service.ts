// src/lead-pipeline/lead-pipeline.service.ts
import { Injectable } from '@nestjs/common';
import { LeadAnalyzerChainService } from './chains/lead-analyzer-chain.service';

@Injectable()
export class LeadPipelineService {
  constructor(private readonly leadAnalyzer: LeadAnalyzerChainService) {}
  
  async processLead(emailText: string) {
    // 🚀 FUTURE EXPANSION POINT:
    // This is where you could add CRM database checks, rate-limiting, 
    // or webhook validation before spending money on Gemini/Groq API calls.
    
    return this.leadAnalyzer.processLeadPipeline(emailText);
  }
}