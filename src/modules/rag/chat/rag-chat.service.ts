import { Injectable } from '@nestjs/common';

export interface ChatResponse {
  answer: string;
  sourceChunkIds: string[];
  sessionId: string;
}

// TODO: Phase 2 — Task 2.2
@Injectable()
export class RagChatService {
  /**
   * Full RAG flow: embed query → vector search → build prompt → LLM → return answer.
   * Maintains session-based conversation memory in a Map.
   */
  async chat(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _query: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _sessionId: string,
  ): Promise<ChatResponse> {
    throw new Error('RagChatService.chat() not yet implemented — see Phase 2 Task 2.2');
  }
}
