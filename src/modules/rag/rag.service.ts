import { Injectable, Logger, InternalServerErrorException, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { ExtractorService } from './pipeline/extractor.service';
import { ChunkerService } from './pipeline/chunker.service';
import { EmbedderService } from './pipeline/embedder.service';

@Injectable()
export class RagService implements OnModuleInit {
  private readonly logger = new Logger(RagService.name);
  private prisma: PrismaClient;

  constructor(
    private extractor: ExtractorService,
    private chunker: ChunkerService,
    private embedder: EmbedderService,
  ) {}

  // This runs exactly when NestJS is fully loaded and ready
  async onModuleInit() {
    if (!process.env.DATABASE_URL) {
      this.logger.error('CRITICAL: DATABASE_URL is missing from your environment variables!');
      return;
    }

    const pool = new Pool({ 
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false } 
    });
    
    const adapter = new PrismaPg(pool);
    this.prisma = new PrismaClient({ adapter });
    
    // Optional: Connect immediately to verify it works
    await this.prisma.$connect();
  }

  // ... Keep your existing processDocument method exactly as it is below this!
  async processDocument(file: Express.Multer.File) {

    // 1. Create a tracking record in the DB
    const doc = await this.prisma.document.create({
      data: {
        filename: file.originalname,
        mimeType: file.mimetype,
        status: 'processing',
      },
    });

    try {
      this.logger.log(`Processing document: ${doc.id}`);

      // 2. Extract text from PDF/DOCX
      const text = await this.extractor.extract(file);

      // 3. Chunk the text
      const chunks = this.chunker.chunk(text);

      // 4. Generate vector embeddings via LlmService (gemini-embedding-001, 1536-dim)
      const embeddings = await this.embedder.embedMany(chunks);

      // 5. Save chunks + embeddings to DB via raw SQL for pgvector
      for (let i = 0; i < chunks.length; i++) {
        const chunkText = chunks[i];
        const embeddingString = `[${embeddings[i].join(',')}]`;
        const metadata = JSON.stringify({
          chunkIndex: i,
          totalChunks: chunks.length,
          source: file.originalname,
          mimeType: file.mimetype,
        });

        await this.prisma.$executeRaw`
          INSERT INTO document_chunks (document_id, content, chunk_index, embedding, metadata)
          VALUES (${doc.id}::uuid, ${chunkText}, ${i}, ${embeddingString}::vector, ${metadata}::jsonb)
        `;
      }

      // 6. Mark as finished!
      await this.prisma.document.update({
        where: { id: doc.id },
        data: { status: 'ready' },
      });

      this.logger.log(`Successfully processed document: ${doc.id}`);
      return { documentId: doc.id, chunksProcessed: chunks.length };

    } catch (error) {
      this.logger.error(`Failed to process document ${doc.id}`, error);
      
      // Mark as failed if anything crashes
      await this.prisma.document.update({
        where: { id: doc.id },
        data: { status: 'failed' },
      });
      
      throw new InternalServerErrorException('Document processing failed');
    }
  }
}