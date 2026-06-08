import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { DocumentChunkEntity } from '../entity/document-chunk.entity';

@Injectable()
export class VectorSearchService {
  private readonly logger = new Logger(VectorSearchService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Finds the top-K most relevant chunks using Hybrid Search (Vector + Keyword)
   * and mathematically combines them using Reciprocal Rank Fusion (RRF).
   */
  async search(
    queryText: string,
    queryVector: number[],
    clientId: string,
    topK: number = 5,
    documentId?: string,
  ): Promise<DocumentChunkEntity[]> {
    const vectorString = `[${queryVector.join(',')}]`;
    const k = 60; // RRF constant

    try {
      let vectorResults: any[];
      let keywordResults: any[];
      
      if (documentId) {
        // 1. Vector Search
        vectorResults = await this.prisma.$queryRaw`
          SELECT dc.id, dc.document_id as "documentId", dc.content, dc.chunk_index as "chunkIndex", dc.metadata, dc.created_at as "createdAt",
                 1 - (dc.embedding <=> ${vectorString}::vector) as similarity
          FROM document_chunks dc
          JOIN documents d ON d.id = dc.document_id
          WHERE dc.document_id = ${documentId}::uuid AND d.client_id = ${clientId}
          ORDER BY dc.embedding <=> ${vectorString}::vector
          LIMIT 20;
        `;

        // 2. Keyword Full-Text Search
        keywordResults = await this.prisma.$queryRaw`
          SELECT dc.id, dc.document_id as "documentId", dc.content, dc.chunk_index as "chunkIndex", dc.metadata, dc.created_at as "createdAt",
                 ts_rank(to_tsvector('english', dc.content), plainto_tsquery('english', ${queryText})) as rank_score
          FROM document_chunks dc
          JOIN documents d ON d.id = dc.document_id
          WHERE dc.document_id = ${documentId}::uuid AND d.client_id = ${clientId}
            AND to_tsvector('english', dc.content) @@ plainto_tsquery('english', ${queryText})
          ORDER BY rank_score DESC
          LIMIT 20;
        `;
      } else {
        // 1. Vector Search
        vectorResults = await this.prisma.$queryRaw`
          SELECT dc.id, dc.document_id as "documentId", dc.content, dc.chunk_index as "chunkIndex", dc.metadata, dc.created_at as "createdAt",
                 1 - (dc.embedding <=> ${vectorString}::vector) as similarity
          FROM document_chunks dc
          JOIN documents d ON d.id = dc.document_id
          WHERE d.client_id = ${clientId}
          ORDER BY dc.embedding <=> ${vectorString}::vector
          LIMIT 20;
        `;

        // 2. Keyword Full-Text Search
        keywordResults = await this.prisma.$queryRaw`
          SELECT dc.id, dc.document_id as "documentId", dc.content, dc.chunk_index as "chunkIndex", dc.metadata, dc.created_at as "createdAt",
                 ts_rank(to_tsvector('english', dc.content), plainto_tsquery('english', ${queryText})) as rank_score
          FROM document_chunks dc
          JOIN documents d ON d.id = dc.document_id
          WHERE d.client_id = ${clientId}
            AND to_tsvector('english', dc.content) @@ plainto_tsquery('english', ${queryText})
          ORDER BY rank_score DESC
          LIMIT 20;
        `;
      }

      // 3. Reciprocal Rank Fusion (RRF)
      const rrfScores = new Map<string, { score: number; chunk: any }>();

      // Apply Vector Ranks
      vectorResults.forEach((chunk, index) => {
        const rank = index + 1;
        const score = 1.0 / (k + rank);
        rrfScores.set(chunk.id, { score, chunk });
      });

      // Apply Keyword Ranks
      keywordResults.forEach((chunk, index) => {
        const rank = index + 1;
        const score = 1.0 / (k + rank);
        if (rrfScores.has(chunk.id)) {
          rrfScores.get(chunk.id)!.score += score;
        } else {
          rrfScores.set(chunk.id, { score, chunk });
        }
      });

      // Sort by combined RRF score and take top-K
      const combinedResults = Array.from(rrfScores.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(entry => entry.chunk);

      this.logger.log(`Hybrid Search: Found ${vectorResults.length} vector matches, ${keywordResults.length} keyword matches. Returned top ${combinedResults.length} chunks via RRF.`);
      return combinedResults as DocumentChunkEntity[];
    } catch (error) {
      this.logger.error('Failed to execute vector search', error);
      throw error;
    }
  }
}

