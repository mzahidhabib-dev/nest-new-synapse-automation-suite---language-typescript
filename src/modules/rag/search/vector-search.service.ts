import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { DocumentChunkEntity } from '../entity/document-chunk.entity';
import { LlmService } from '../../llm/llm.service';

@Injectable()
export class VectorSearchService {
  private readonly logger = new Logger(VectorSearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LlmService
  ) {}

  /**
   * Finds the top-K most relevant chunks using Hybrid Search (Vector + Keyword)
   * and mathematically combines them using Reciprocal Rank Fusion (RRF).
   */
  async search(
    queryText: string,
    queryVector: number[],
    tenantId: string,
    topK: number = 5,
    documentId?: string,
  ): Promise<DocumentChunkEntity[]> {
    const vectorString = `[${queryVector.join(',')}]`;
    const k = 60; // RRF constant

    try {
      let vectorResults: any[];
      let keywordResults: any[];
      
      if (documentId) {
        // 1. Vector Search — only from ready documents
        vectorResults = await this.prisma.$queryRaw`
          SELECT dc.id, dc.document_id as "documentId", dc.content, dc.chunk_index as "chunkIndex", dc.metadata, dc.created_at as "createdAt",
                 1 - (dc.embedding <=> ${vectorString}::vector) as similarity
          FROM document_chunks dc
          JOIN documents d ON d.id = dc.document_id AND d.status = 'ready'
          WHERE dc.document_id = ${documentId}::uuid AND dc.tenant_id = ${tenantId}::uuid
          ORDER BY dc.embedding <=> ${vectorString}::vector
          LIMIT 20;
        `;

        // 2. Keyword Full-Text Search — only from ready documents
        keywordResults = await this.prisma.$queryRaw`
          SELECT dc.id, dc.document_id as "documentId", dc.content, dc.chunk_index as "chunkIndex", dc.metadata, dc.created_at as "createdAt",
                 ts_rank(to_tsvector('english', dc.content), plainto_tsquery('english', ${queryText})) as rank_score
          FROM document_chunks dc
          JOIN documents d ON d.id = dc.document_id AND d.status = 'ready'
          WHERE dc.document_id = ${documentId}::uuid AND dc.tenant_id = ${tenantId}::uuid
            AND to_tsvector('english', dc.content) @@ plainto_tsquery('english', ${queryText})
          ORDER BY rank_score DESC
          LIMIT 20;
        `;
      } else {
        // 1. Vector Search — only from ready documents
        vectorResults = await this.prisma.$queryRaw`
          SELECT dc.id, dc.document_id as "documentId", dc.content, dc.chunk_index as "chunkIndex", dc.metadata, dc.created_at as "createdAt",
                 1 - (dc.embedding <=> ${vectorString}::vector) as similarity
          FROM document_chunks dc
          JOIN documents d ON d.id = dc.document_id AND d.status = 'ready'
          WHERE dc.tenant_id = ${tenantId}::uuid
          ORDER BY dc.embedding <=> ${vectorString}::vector
          LIMIT 20;
        `;

        // 2. Keyword Full-Text Search — only from ready documents
        keywordResults = await this.prisma.$queryRaw`
          SELECT dc.id, dc.document_id as "documentId", dc.content, dc.chunk_index as "chunkIndex", dc.metadata, dc.created_at as "createdAt",
                 ts_rank(to_tsvector('english', dc.content), plainto_tsquery('english', ${queryText})) as rank_score
          FROM document_chunks dc
          JOIN documents d ON d.id = dc.document_id AND d.status = 'ready'
          WHERE dc.tenant_id = ${tenantId}::uuid
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

      // Sort by combined RRF score and take top-10 candidates for re-ranking
      const rrfCandidates = Array.from(rrfScores.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map(entry => entry.chunk);

      if (rrfCandidates.length === 0) {
        return [];
      }

      this.logger.log(`Hybrid Search: Sending ${rrfCandidates.length} chunks to LLM for Re-ranking...`);

      // 4. LLM Re-ranking
      const scores = await this.llmService.rerankChunks(queryText, rrfCandidates);
      console.log('[DIAG] rerankChunks scores array:', scores);
      this.logger.log(`[DIAG] rerank raw scores length: ${scores.length}`);
      
      // Filter and sort based on the LLM's strict score (keep chunks with score >= 5)
      const rerankedResults = scores
        .filter(s => s.score >= 2)
        .sort((a, b) => b.score - a.score)
        .map(s => rrfCandidates[s.index])
        .filter(chunk => chunk !== undefined)
        .slice(0, topK);

      this.logger.log(`Hybrid Search: RRF yielded ${rrfCandidates.length} candidates. Re-ranking filtered it down to ${rerankedResults.length} highly relevant chunks.`);
      return rerankedResults as DocumentChunkEntity[];
    } catch (error) {
      this.logger.error('Failed to execute vector search', error);
      throw error;
    }
  }
}

