import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { DocumentChunkEntity } from '../entity/document-chunk.entity';

@Injectable()
export class VectorSearchService implements OnModuleInit {
  private readonly logger = new Logger(VectorSearchService.name);
  private prisma: PrismaClient;

  async onModuleInit() {
    if (!process.env.DATABASE_URL) return;
    const pool = new Pool({ 
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false } 
    });
    const adapter = new PrismaPg(pool);
    this.prisma = new PrismaClient({ adapter });
    await this.prisma.$connect();
  }

  /**
   * Finds the top-K most similar chunks to the given query vector
   * using cosine similarity (pgvector <=> operator).
   */
  async search(
    queryVector: number[],
    topK: number = 5,
    documentId?: string,
  ): Promise<DocumentChunkEntity[]> {
    const vectorString = `[${queryVector.join(',')}]`;

    try {
      // We use raw SQL because Prisma doesn't natively support pgvector's <=> operator yet
      let results: any[];
      
      if (documentId) {
        results = await this.prisma.$queryRaw`
          SELECT id, document_id as "documentId", content, chunk_index as "chunkIndex", metadata, created_at as "createdAt",
                 1 - (embedding <=> ${vectorString}::vector) as similarity
          FROM document_chunks
          WHERE document_id = ${documentId}::uuid
          ORDER BY embedding <=> ${vectorString}::vector
          LIMIT ${topK};
        `;
      } else {
        results = await this.prisma.$queryRaw`
          SELECT id, document_id as "documentId", content, chunk_index as "chunkIndex", metadata, created_at as "createdAt",
                 1 - (embedding <=> ${vectorString}::vector) as similarity
          FROM document_chunks
          ORDER BY embedding <=> ${vectorString}::vector
          LIMIT ${topK};
        `;
      }

      return results as DocumentChunkEntity[];
    } catch (error) {
      this.logger.error('Failed to execute vector search', error);
      throw error;
    }
  }
}

