import { Injectable } from '@nestjs/common';
import { DocumentChunkEntity } from '../entity/document-chunk.entity';

// TODO: Phase 2 — Task 2.1
@Injectable()
export class VectorSearchService {
  /**
   * Finds the top-K most similar chunks to the given query vector
   * using cosine similarity (pgvector <=> operator).
   */
  async search(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _queryVector: number[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _topK: number = 5,
  ): Promise<DocumentChunkEntity[]> {
    throw new Error('VectorSearchService.search() not yet implemented — see Phase 2 Task 2.1');
  }
}
