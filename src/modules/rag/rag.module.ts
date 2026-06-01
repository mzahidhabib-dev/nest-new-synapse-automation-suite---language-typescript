import { Module } from '@nestjs/common';
import { RagService } from './rag.service';
import { RagController } from './rag.controller';
import { ExtractorService } from './pipeline/extractor.service';
import { ChunkerService } from './pipeline/chunker.service';
import { EmbedderService } from './pipeline/embedder.service';
import { LlmModule } from '../llm/llm.module'; 

@Module({
  imports: [LlmModule], // <-- Required so EmbedderService can use LlmService
  controllers: [RagController],
  providers: [
    RagService, 
    ExtractorService, 
    ChunkerService, 
    EmbedderService // <-- All pipeline services must be registered here!
  ],
})
export class RagModule {}