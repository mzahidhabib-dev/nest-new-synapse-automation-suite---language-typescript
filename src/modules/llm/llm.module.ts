import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmService } from './llm.service';
import { LlmConfigService } from './llm.config';

@Module({
  imports: [ConfigModule],
  providers: [LlmService, LlmConfigService],
  exports: [LlmService],
})
export class LlmModule {}