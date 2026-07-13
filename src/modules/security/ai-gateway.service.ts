import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PromptInjectionGuard } from './prompt-injection.guard';
import axios from 'axios';

export interface SecurityResult {
  safeMessage: string;
  blocked: boolean;
  reason?: string;
  entitiesRedacted?: string[];
}

@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);
  private readonly PII_SERVICE_URL = process.env.PII_SERVICE_URL || 'http://localhost:8001';

  constructor(private readonly promptInjectionGuard: PromptInjectionGuard) {}

  /**
   * Process user input through full security pipeline before it reaches the LLM
   */
  async processInput(
    rawMessage: string,
    tenantId: string,
    userId: string,
  ): Promise<SecurityResult> {
    
    // Step 1: Length check to prevent DOS via massive token count
    if (rawMessage.length > 2000) {
      this.logger.warn(`[Security] Blocked message > 2000 chars from user ${userId}`);
      return { safeMessage: '', blocked: true, reason: 'Message exceeds maximum length of 2000 characters.' };
    }

    // Step 2: Prompt Injection Defense
    try {
      this.promptInjectionGuard.check(rawMessage);
    } catch (error: any) {
      this.logger.warn(`[Security] Prompt injection blocked from user ${userId}: ${rawMessage}`);
      return { safeMessage: '', blocked: true, reason: error.message };
    }

    // Step 3: PII Redaction Microservice
    let finalMessage = rawMessage;
    let entitiesRedacted: string[] = [];

    try {
      const response = await axios.post(`${this.PII_SERVICE_URL}/redact`, {
        text: rawMessage,
        language: 'en'
      }, { timeout: 2000 }); // Fast fail if Python service is down

      if (response.data && response.data.redacted_text) {
        finalMessage = response.data.redacted_text;
        entitiesRedacted = response.data.entities_detected || [];
        
        if (entitiesRedacted.length > 0) {
          this.logger.log(`[Security] Redacted PII for user ${userId}: ${entitiesRedacted.join(', ')}`);
        }
      }
    } catch (error) {
      // If the PII service is down, we log an error but CAN either fail closed or fail open.
      // In high-security systems, fail closed:
      this.logger.error(`[Security] PII Service unreachable! Error: ${error.message}`);
      // return { safeMessage: '', blocked: true, reason: 'Security scanning service is temporarily unavailable.' };
      
      // For this implementation, we will fail open to keep the chat working if Python isn't running
      this.logger.warn(`[Security] Failing open due to PII service unavailability.`);
    }

    return {
      safeMessage: finalMessage,
      blocked: false,
      entitiesRedacted
    };
  }
}
