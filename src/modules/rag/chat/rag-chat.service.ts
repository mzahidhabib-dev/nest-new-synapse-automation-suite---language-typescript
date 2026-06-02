import { Injectable, Logger } from '@nestjs/common';
import { VectorSearchService } from '../search/vector-search.service';
import { LlmService } from '../../llm/llm.service';
import { ChatMessageDto } from '../dto/chat-message.dto';

export interface ChatResponse {
  answer: string;
  sourceChunkIds: string[];
  sessionId: string;
}

@Injectable()
export class RagChatService {
  private readonly logger = new Logger(RagChatService.name);
  
  // In-memory session storage (Map<sessionId, ChatMessageDto[]>)
  // In V2, this should be moved to a PostgreSQL table
  private readonly sessions = new Map<string, ChatMessageDto[]>();

  constructor(
    private readonly llmService: LlmService,
    private readonly vectorSearch: VectorSearchService,
  ) {}

  /**
   * Retrieves or initializes the chat history for a session.
   */
  getChatHistory(sessionId: string): ChatMessageDto[] {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, []);
    }
    return this.sessions.get(sessionId)!;
  }

  /**
   * Full RAG flow: embed query → vector search → build prompt → LLM → return answer.
   * Maintains session-based conversation memory in a Map.
   */
  async chat(
    query: string,
    sessionId: string,
  ): Promise<ChatResponse> {
    this.logger.log(`Received query for session ${sessionId}: "${query}"`);

    try {
      // 1. Embed the user's query
      const [queryEmbedding] = await this.llmService.createEmbeddings([query]);

      // 2. Search for top-5 most relevant chunks in the vector DB
      const topChunks = await this.vectorSearch.search(queryEmbedding, 5);

      // 3. Extract the text and source chunk IDs
      const contextTexts = topChunks.map((c) => c.content);
      const sourceChunkIds = topChunks.map((c) => c.id);

      // 4. Retrieve chat history (last 5 messages to avoid blowing up context window)
      const history = this.getChatHistory(sessionId);
      const recentHistory = history.slice(-5);
      
      const historyPrompt = recentHistory
        .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
        .join('\n');

      // 5. Construct the prompt for the LLM
      const prompt = `
You are a helpful AI assistant. You have been provided with some context from a private document database.
Use ONLY the provided context to answer the user's question. If the context does not contain the answer, say "I don't have enough information in my database to answer that." Do not invent or hallucinate information.

--- CONTEXT START ---
${contextTexts.join('\n\n')}
--- CONTEXT END ---

--- RECENT CHAT HISTORY ---
${historyPrompt}
---------------------------

User Question: ${query}
`;

      // 6. Call the LLM to generate the answer using Gemini
      const answer = await this.llmService.callGemini(prompt);

      // 7. Update chat history with both the new query and the LLM's answer
      history.push({ role: 'user', content: query, sessionId });
      history.push({ role: 'assistant', content: answer, sessionId });

      return {
        answer,
        sourceChunkIds,
        sessionId,
      };
    } catch (error) {
      this.logger.error(`Error in RAG chat flow: ${error.message}`, error.stack);
      throw error;
    }
  }
}

