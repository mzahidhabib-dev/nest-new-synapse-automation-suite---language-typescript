import { Injectable, Logger } from '@nestjs/common';
import { VectorSearchService } from '../search/vector-search.service';
import { LlmService } from '../../llm/llm.service';
import { ChatMessageDto } from '../dto/chat-message.dto';
import { PrismaService } from '../prisma.service';

export interface ChatResponse {
  answer: string;
  sourceChunkIds: string[];
  sessionId: string;
}

@Injectable()
export class RagChatService {
  private readonly logger = new Logger(RagChatService.name);

  constructor(
    private readonly llmService: LlmService,
    private readonly vectorSearch: VectorSearchService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Retrieves the chat history for a session from PostgreSQL.
   */
  async getChatHistory(sessionId: string, clientId: string): Promise<ChatMessageDto[]> {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!session || session.clientId !== clientId) {
      return [];
    }

    return session.messages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      sessionId: msg.sessionId,
    }));
  }

  /**
   * Full RAG flow with persistent PostgreSQL conversation memory.
   */
  async chat(
    query: string,
    sessionId: string,
    clientId: string,
  ): Promise<ChatResponse> {
    this.logger.log(`Received query for session ${sessionId} (Client: ${clientId}): "${query}"`);

    try {
      // 1. Embed the user's query
      const [queryEmbedding] = await this.llmService.createEmbeddings([query]);

      // 2. Search for top-5 most relevant chunks in the vector DB scoped to clientId
      const topChunks = await this.vectorSearch.search(queryEmbedding, clientId, 5);

      // 3. Extract the text and source chunk IDs
      const contextTexts = topChunks.map((c) => c.content);
      const sourceChunkIds = topChunks.map((c) => c.id);

      // 4. Retrieve chat history
      const history = await this.getChatHistory(sessionId, clientId);
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

      // 7. Upsert session and persist messages to DB
      await this.prisma.chatSession.upsert({
        where: { id: sessionId },
        create: { id: sessionId, clientId },
        update: {},
      });

      await this.prisma.chatMessage.createMany({
        data: [
          { sessionId, role: 'user', content: query },
          { sessionId, role: 'assistant', content: answer },
        ],
      });

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

