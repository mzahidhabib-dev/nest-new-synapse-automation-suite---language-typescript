import { Module } from '@nestjs/common';
import { RagService } from './rag.service';
import { RagController } from './rag.controller';
import { ExtractorService } from './pipeline/extractor.service';
import { ChunkerService } from './pipeline/chunker.service';
import { EmbedderService } from './pipeline/embedder.service';
import { VectorSearchService } from './search/vector-search.service';
import { RagChatService } from './chat/rag-chat.service';
import { PrismaService } from './prisma.service';
import { LlmModule } from '../llm/llm.module'; 
import { SecurityModule } from '../security/security.module';

@Module({
  imports: [LlmModule, SecurityModule],
  controllers: [RagController],
  providers: [
    RagService, 
    ExtractorService, 
    ChunkerService, 
    EmbedderService,
    VectorSearchService,
    RagChatService,
  ],
})
export class RagModule {}