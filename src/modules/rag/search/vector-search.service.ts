import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { DocumentChunkEntity } from '../entity/document-chunk.entity';

@Injectable()
export class VectorSearchService {
  private readonly logger = new Logger(VectorSearchService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Finds the top-K most similar chunks to the given query vector
   * using cosine similarity (pgvector <=> operator).
   */
  async search(
    queryVector: number[],
    clientId: string,
    topK: number = 5,
    documentId?: string,
  ): Promise<DocumentChunkEntity[]> {
    const vectorString = `[${queryVector.join(',')}]`;

    try {
      let results: any[];
      
      if (documentId) {
        results = await this.prisma.$queryRaw`
          SELECT dc.id, dc.document_id as "documentId", dc.content, dc.chunk_index as "chunkIndex", dc.metadata, dc.created_at as "createdAt",
                 1 - (dc.embedding <=> ${vectorString}::vector) as similarity
          FROM document_chunks dc
          JOIN documents d ON d.id = dc.document_id
          WHERE dc.document_id = ${documentId}::uuid AND d.client_id = ${clientId}
          ORDER BY dc.embedding <=> ${vectorString}::vector
          LIMIT ${topK};
        `;
      } else {
        results = await this.prisma.$queryRaw`
          SELECT dc.id, dc.document_id as "documentId", dc.content, dc.chunk_index as "chunkIndex", dc.metadata, dc.created_at as "createdAt",
                 1 - (dc.embedding <=> ${vectorString}::vector) as similarity
          FROM document_chunks dc
          JOIN documents d ON d.id = dc.document_id
          WHERE d.client_id = ${clientId}
          ORDER BY dc.embedding <=> ${vectorString}::vector
          LIMIT ${topK};
        `;
      }

      // FUTURE ENHANCEMENT: Integrate Cohere/Jina Re-ranking API here.
      // For now, we return the raw cosine similarity ranking.
      return results as DocumentChunkEntity[];
    } catch (error) {
      this.logger.error('Failed to execute vector search', error);
      throw error;
    }
  }
}

