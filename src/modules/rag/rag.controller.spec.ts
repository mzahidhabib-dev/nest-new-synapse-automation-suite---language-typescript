import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ExtractorService } from './pipeline/extractor.service';
import { ChunkerService } from './pipeline/chunker.service';
import { EmbedderService } from './pipeline/embedder.service';

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
  private prisma = new PrismaClient(); // Connect to database

  constructor(
    private extractor: ExtractorService,
    private chunker: ChunkerService,
    private embedder: EmbedderService,
  ) {}

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

      // 4. Generate vectors via OpenAI
      const embeddings = await this.embedder.embedMany(chunks);

      // 5. Save chunks + embeddings to DB
      // We use raw SQL here because Prisma's standard `createMany` doesn't handle pgvector types natively yet
      for (let i = 0; i < chunks.length; i++) {
        const chunkText = chunks[i];
        // Convert the number array to a string format that pgvector accepts: "[0.1, 0.2, ...]"
        const embeddingString = `[${embeddings[i].join(',')}]`;

        await this.prisma.$executeRaw`
          INSERT INTO document_chunks (document_id, content, chunk_index, embedding)
          VALUES (${doc.id}::uuid, ${chunkText}, ${i}, ${embeddingString}::vector)
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