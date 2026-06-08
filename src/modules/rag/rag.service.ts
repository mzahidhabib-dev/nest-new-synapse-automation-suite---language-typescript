import { Injectable, Logger, InternalServerErrorException, ConflictException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { ExtractorService } from './pipeline/extractor.service';
import { ChunkerService } from './pipeline/chunker.service';
import { EmbedderService } from './pipeline/embedder.service';
import * as crypto from 'crypto';

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private extractor: ExtractorService,
    private chunker: ChunkerService,
    private embedder: EmbedderService,
    private prisma: PrismaService,
  ) { }

  async processDocument(file: Express.Multer.File, clientId: string) {
    // 0. Calculate MD5 hash for Incremental Updates / Deduplication
    const fileHash = crypto.createHash('md5').update(file.buffer).digest('hex');

    // Check if this exact file was already processed by this tenant
    const existingDoc = await this.prisma.$queryRaw<any[]>`
      SELECT id, status FROM documents 
      WHERE client_id = ${clientId} AND file_hash = ${fileHash} 
      LIMIT 1;
    `;

    if (existingDoc && existingDoc.length > 0) {
      this.logger.warn(`File already exists for client ${clientId} with hash ${fileHash}. Skipping.`);
      throw new ConflictException('This exact file has already been uploaded.');
    }

    // 1. Create a tracking record in the DB using raw query to insert file_hash
    const result = await this.prisma.$queryRaw<any[]>`
      INSERT INTO documents (client_id, filename, mime_type, status, file_hash)
      VALUES (${clientId}, ${file.originalname}, ${file.mimetype}, 'processing', ${fileHash})
      RETURNING id;
    `;
    const docId = result[0].id;

    try {
      this.logger.log(`Processing document: ${docId} for client: ${clientId}`);

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
          VALUES (${docId}::uuid, ${chunkText}, ${i}, ${embeddingString}::vector, ${metadata}::jsonb)
        `;
      }

      // 6. Mark as finished!
      await this.prisma.document.update({
        where: { id: docId },
        data: { status: 'ready' },
      });

      this.logger.log(`Successfully processed document: ${docId}`);
      return { documentId: docId, chunksProcessed: chunks.length };

    } catch (error) {
      this.logger.error(`Failed to process document ${docId}`, error);

      // Mark as failed if anything crashes
      await this.prisma.document.update({
        where: { id: docId },
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

  /**
   * Retrieves global statistics for the Admin Dashboard.
   * This spans across all tenants.
   */
  async getAdminStats() {
    try {
      const [totalDocuments, totalSessions, totalChunks] = await Promise.all([
        this.prisma.document.count(),
        this.prisma.chatSession.count(),
        this.prisma.documentChunk.count(),
      ]);

      // Count documents per tenant
      const documentsByTenant = await this.prisma.document.groupBy({
        by: ['clientId'],
        _count: {
          id: true,
        },
      });

      return {
        totalDocuments,
        totalSessions,
        totalChunks,
        documentsByTenant: documentsByTenant.map(d => ({
          clientId: d.clientId,
          count: d._count.id,
        })),
      };
    } catch (error) {
      this.logger.error('Failed to get admin stats', error);
      throw new InternalServerErrorException('Failed to retrieve admin stats');
    }
  }
}
