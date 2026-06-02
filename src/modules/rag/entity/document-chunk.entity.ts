export class DocumentChunkEntity {
  id: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  embedding?: number[]; // 3072-dim vector (gemini-embedding-001)
  metadata?: Record<string, unknown>;
  createdAt: Date;
}
