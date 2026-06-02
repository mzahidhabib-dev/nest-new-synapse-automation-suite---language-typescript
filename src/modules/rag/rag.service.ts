import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { ExtractorService } from './pipeline/extractor.service';
import { ChunkerService } from './pipeline/chunker.service';
import { EmbedderService } from './pipeline/embedder.service';

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private extractor: ExtractorService,
    private chunker: ChunkerService,
    private embedder: EmbedderService,
    private prisma: PrismaService,
  ) {}

  // ... Keep your existing processDocument method exactly as it is below this!
  async processDocument(file: Express.Multer.File, clientId: string) {

    // 1. Create a tracking record in the DB
    const doc = await this.prisma.document.create({
      data: {
        filename: file.originalname,
        mimeType: file.mimetype,
        status: 'processing',
        clientId,
      },
    });

    try {
      this.logger.log(`Processing document: ${doc.id} for client: ${clientId}`);

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

  /**
   * Retrieves all uploaded documents for a specific client.
   */
  async getAllDocuments(clientId: string) {
    return this.prisma.document.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Deletes a document by ID. Validates clientId to prevent cross-tenant deletion.
   */
  async deleteDocument(id: string, clientId: string) {
    try {
      // First check if it belongs to the client
      const doc = await this.prisma.document.findUnique({ where: { id } });
      if (!doc || doc.clientId !== clientId) {
        throw new InternalServerErrorException('Document not found or unauthorized');
      }

      await this.prisma.document.delete({
        where: { id },
      });
      return { success: true, message: `Document ${id} deleted successfully.` };
    } catch (error) {
      this.logger.error(`Failed to delete document ${id}`, error);
      throw new InternalServerErrorException('Failed to delete document');
    }
  }
}