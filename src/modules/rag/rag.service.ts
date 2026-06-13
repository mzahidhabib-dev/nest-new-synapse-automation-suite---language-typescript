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

  /**
   * Creates a document record in the DB immediately, then kicks off ingestion
   * in the background WITHOUT blocking the HTTP response.
   *
   * Before this fix, the server would freeze for 10–30 seconds on large PDFs
   * because the entire pipeline (extract → chunk → embed → store) was awaited
   * synchronously inside the HTTP request handler.
   */
  async processDocument(file: Express.Multer.File, tenantId: string) {
    // 0. Calculate MD5 hash for deduplication
    const fileHash = crypto.createHash('md5').update(file.buffer).digest('hex');

    // 1. Check if this exact file was already processed by this tenant
    const existingDoc = await this.prisma.$queryRaw<any[]>`
      SELECT id, status FROM documents 
      WHERE tenant_id = ${tenantId}::uuid AND file_hash = ${fileHash} 
      LIMIT 1;
    `;

    if (existingDoc && existingDoc.length > 0) {
      this.logger.warn(`File already exists for tenant ${tenantId} with hash ${fileHash}. Skipping.`);
      throw new ConflictException('This exact file has already been uploaded.');
    }

    const fileSizeKb = Math.round(file.size / 1024) || 1;

    // 2. Create a tracking record in the DB with status = 'processing'
    const result = await this.prisma.$queryRaw<any[]>`
      INSERT INTO documents (tenant_id, filename, mime_type, file_size_kb, status, file_hash)
      VALUES (${tenantId}::uuid, ${file.originalname}, ${file.mimetype}, ${fileSizeKb}, 'processing', ${fileHash})
      RETURNING id;
    `;
    const docId = result[0].id;

    // 3. ✅ FIX: Fire background ingestion — do NOT await.
    //    The HTTP response returns immediately with { documentId, status: 'processing' }.
    //    The frontend polls GET /documents to check when status becomes 'ready'.
    this.ingestInBackground(docId, file, tenantId);

    this.logger.log(`Document ${docId} created. Background ingestion started.`);
    return { documentId: docId, status: 'processing' };
  }

  /**
   * Full ingestion pipeline running in the background (not awaited by HTTP handler).
   * If anything fails, the document is marked 'failed' so the UI can show an error.
   */
  private async ingestInBackground(
    docId: string,
    file: Express.Multer.File,
    tenantId: string,
  ): Promise<void> {
    try {
      this.logger.log(`[BG] Starting ingestion for document: ${docId}`);

      // 1. Extract text as structured pages (with real page numbers)
      const pages = await this.extractor.extract(file);
      if (pages.length === 0 || pages.every(p => !p.text.trim())) {
        throw new Error('No text could be extracted from this document');
      }

      // 2. Chunk pages into Chunk[] objects — each chunk carries its page number
      const chunks = this.chunker.chunk(pages, file.originalname);

      // 3. Generate vector embeddings in batches
      const chunkTexts = chunks.map(c => c.content);
      const embeddings = await this.embedder.embedMany(chunkTexts);

      // 4. Save chunks + embeddings to DB with full metadata (including page number)
      const insertPromises = chunks.map((chunk, i) => {
        const embeddingString = `[${embeddings[i].join(',')}]`;
        // metadata now includes: page, chunkIndex, source
        const metadata = JSON.stringify(chunk.metadata);

        return this.prisma.$executeRaw`
          INSERT INTO document_chunks (document_id, tenant_id, content, chunk_index, embedding, metadata)
          VALUES (${docId}::uuid, ${tenantId}::uuid, ${chunk.content}, ${chunk.metadata.chunkIndex}, ${embeddingString}::vector, ${metadata}::jsonb)
        `;
      });

      await this.prisma.$transaction(insertPromises);

      // 5. Mark document as ready
      await this.prisma.document.update({
        where: { id: docId },
        data: { status: 'ready', totalChunks: chunks.length },
      });

      this.logger.log(`[BG] Successfully processed document: ${docId} (${chunks.length} chunks from ${pages.length} pages)`);
    } catch (error) {
      this.logger.error(`[BG] Failed to process document ${docId}`, error);

      // Mark as failed so the UI can show an error state
      await this.prisma.document.update({
        where: { id: docId },
        data: { status: 'failed' },
      }).catch(e => this.logger.error('Could not mark document as failed', e));
    }
  }

  /**
   * Retrieves all uploaded documents for a specific tenant.
   */
  async getAllDocuments(tenantId: string) {
    return this.prisma.document.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Deletes a document by ID. Validates tenantId to prevent cross-tenant deletion.
   */
  async deleteDocument(id: string, tenantId: string) {
    try {
      const doc = await this.prisma.document.findUnique({ where: { id } });
      if (!doc || doc.tenantId !== tenantId) {
        throw new InternalServerErrorException('Document not found or unauthorized');
      }

      await this.prisma.document.delete({ where: { id } });
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
      const [totalDocuments, totalSessions, totalChunks, blockedRequests, recentAudits] = await Promise.all([
        this.prisma.document.count(),
        this.prisma.chatSession.count(),
        this.prisma.documentChunk.count(),
        this.prisma.rateLimit.count({ where: { hits: { gte: 20 } } }),
        this.prisma.auditLog.findMany({ take: 5, orderBy: { createdAt: 'desc' } })
      ]);

      const documentsByTenant = await this.prisma.document.groupBy({
        by: ['tenantId'],
        _count: { id: true },
      });

      return {
        totalDocuments,
        totalSessions,
        totalChunks,
        blockedRequests,
        recentAudits,
        documentsByTenant: documentsByTenant.map(d => ({
          tenantId: d.tenantId,
          count: d._count.id,
        })),
      };
    } catch (error) {
      this.logger.error('Failed to get admin stats', error);
      throw new InternalServerErrorException('Failed to retrieve admin stats');
    }
  }

  /**
   * Retrieves specific statistics for a single tenant (Client Dashboard).
   */
  async getClientStats(tenantId: string) {
    try {
      const [totalDocuments, totalSessions, recentDocs] = await Promise.all([
        this.prisma.document.count({ where: { tenantId } }),
        this.prisma.chatSession.count({ where: { tenantId } }),
        this.prisma.document.findMany({
          where: { tenantId },
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: { id: true, filename: true, status: true, createdAt: true }
        })
      ]);

      return { totalDocuments, totalSessions, recentDocs };
    } catch (error) {
      this.logger.error(`Failed to get client stats for ${tenantId}`, error);
      throw new InternalServerErrorException('Failed to retrieve client stats');
    }
  }
}
