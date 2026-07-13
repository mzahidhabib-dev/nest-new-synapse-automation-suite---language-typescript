import { Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class PromptInjectionGuard {
  // Patterns that indicate prompt injection attempts
  private readonly INJECTION_PATTERNS = [
    /ignore (all |previous |above |prior )?instructions/i,
    /disregard (your |all |the )?instructions/i,
    /you are now/i,
    /act as (a |an )?(?!assistant|helpful)/i,
    /forget (everything|all|your)/i,
    /new (role|persona|identity|instructions)/i,
    /system prompt/i,
    /\[INST\]/i,            // LLaMA injection
    /<\|im_start\|>/i,      // ChatML injection
  ];

  /**
   * Scans a message for prompt injection patterns.
   * Throws an exception if an injection is detected, or returns true.
   */
  public check(message: string): boolean {
    for (const pattern of this.INJECTION_PATTERNS) {
      if (pattern.test(message)) {
        throw new BadRequestException('Security Policy Violation: Prompt injection attempt detected and blocked.');
      }
    }
    return true;
  }
}
