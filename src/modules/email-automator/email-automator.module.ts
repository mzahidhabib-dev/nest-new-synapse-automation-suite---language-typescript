// email-automator.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailAutomatorService } from './email-automator.service';
import { EmailAutomatorController } from './email-automator.controller';
import { EmailProcessorService } from './chains/email-processor';
import { LlmModule } from '../llm/llm.module';
import { EmailProcessingLog } from './entity/email-log.entity';

@Module({
  imports: [LlmModule, TypeOrmModule.forFeature([EmailProcessingLog])],
  controllers: [EmailAutomatorController],
  providers: [EmailAutomatorService, EmailProcessorService],
  exports: [EmailAutomatorService],
})
export class EmailAutomatorModule {}