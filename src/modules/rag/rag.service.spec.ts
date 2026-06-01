import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { ExtractorService } from './pipeline/extractor.service';
import { ChunkerService } from './pipeline/chunker.service';
import { EmbedderService } from './pipeline/embedder.service';

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
  private prisma: PrismaClient; // Define it here

  constructor(
    private extractor: ExtractorService,
    private chunker: ChunkerService,
    private embedder: EmbedderService,
  ) {
    // Instantiate it inside the constructor using the v7 Adapter pattern
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaPg(pool);
    this.prisma = new PrismaClient({ adapter });
  }

  // ... keep your existing async processDocument(file: Express.Multer.File) { ... } exactly as it is below this!

  async processDocument(file: Express.Multer.File) {
    const doc = await this.prisma.document.create({
      data: { filename: file.originalname, mimeType: file.mimetype, status: 'processing' },
    });

    try {
      this.logger.log(`Processing document: ${doc.id}`);
      const text = await this.extractor.extract(file);
      const chunks = this.chunker.chunk(text);
      const embeddings = await this.embedder.embedMany(chunks);

      for (let i = 0; i < chunks.length; i++) {
        const chunkText = chunks[i];
        const embeddingString = `[${embeddings[i].join(',')}]`;
        await this.prisma.$executeRaw`
          INSERT INTO document_chunks (document_id, content, chunk_index, embedding)
          VALUES (${doc.id}::uuid, ${chunkText}, ${i}, ${embeddingString}::vector)
        `;
      }

      await this.prisma.document.update({ where: { id: doc.id }, data: { status: 'ready' } });
      return { documentId: doc.id, chunksProcessed: chunks.length };

    } catch (error) {
      this.logger.error(`Failed to process document ${doc.id}`, error);
      await this.prisma.document.update({ where: { id: doc.id }, data: { status: 'failed' } });
      throw new InternalServerErrorException('Document processing failed');
    }
  }
}