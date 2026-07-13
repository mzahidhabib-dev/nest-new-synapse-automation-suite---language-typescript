import { Module } from '@nestjs/common';
import { PromptInjectionGuard } from './prompt-injection.guard';
import { AiGatewayService } from './ai-gateway.service';

@Module({
  providers: [PromptInjectionGuard, AiGatewayService],
  exports: [PromptInjectionGuard, AiGatewayService],
})
export class SecurityModule {}
