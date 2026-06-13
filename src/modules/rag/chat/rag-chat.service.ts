import { Injectable, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { generateText, streamText, embedMany, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { VectorSearchService } from '../search/vector-search.service';
import { LlmService } from '../../llm/llm.service';
import { ChatMessageDto } from '../dto/chat-message.dto';
import { PrismaService } from '../prisma.service';

export interface ChatResponse {
  answer: string;
  sourceChunkIds: string[];
  contextTexts?: string[];
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
  async getChatHistory(sessionId: string, tenantId: string): Promise<ChatMessageDto[]> {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!session || session.tenantId !== tenantId) {
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
    tenantId: string,
    userId: string,
  ): Promise<ChatResponse> {
    this.logger.log(`Received query for session ${sessionId} (Tenant: ${tenantId}): "${query}"`);

    try {
      // 1. Embed the user's query
      const [queryEmbedding] = await this.llmService.createEmbeddings([query]);

      // 2. Search for top-5 most relevant chunks using Hybrid Search (Vector + Keyword)
      const topChunks = await this.vectorSearch.search(query, queryEmbedding, tenantId, 5);

      // 3. Extract the text and source chunk IDs
      const contextTexts = topChunks.map((c) => c.content);
      const sourceChunkIds = topChunks.map((c) => c.id);

      // 4. Retrieve chat history
      const history = await this.getChatHistory(sessionId, tenantId);
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
        create: { id: sessionId, tenantId, userId },
        update: {},
      });

      await this.prisma.chatMessage.createMany({
        data: [
          { sessionId, tenantId, role: 'user', content: query },
          { sessionId, tenantId, role: 'assistant', content: answer },
        ],
      });

      return {
        answer,
        sourceChunkIds,
        contextTexts,
        sessionId,
      };
    } catch (error) {
      this.logger.error(`Error in RAG chat flow: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Full ReAct Agent flow, streaming both Tool calls and Text.
   */
  chatStream(
    query: string,
    sessionId: string,
    tenantId: string,
    userId: string,
  ): Observable<any> {
    this.logger.log(`Received AGENT query for session ${sessionId} (Tenant: ${tenantId}): "${query}"`);

    return new Observable((subscriber) => {
      (async () => {
        try {
          // 1. History
          const history = await this.getChatHistory(sessionId, tenantId);
          const messages: any[] = history.map(msg => ({
            role: msg.role,
            content: msg.content
          }));
          messages.push({ role: 'user', content: query });

      const systemMessage = `You are an advanced, helpful AI assistant.
You have access to internal tools.
ALWAYS use the 'searchDatabase' tool to look up facts, documents, or company information before answering data-specific questions.
When using the 'searchDatabase' tool, you MUST provide a valid 'searchQuery' string parameter.
DO NOT hallucinate. If the tool returns no data, say you don't know.

CRITICAL INSTRUCTION:
When you use information from the database, you MUST cite the exact source document and page number in your final answer using exactly this format:
[Source: filename.pdf, Page X]
You will find the filename in the tool results as [Document: filename.pdf]. You will find the page number inside the chunk text as [PAGE X].`;

      // 2. Start Agent Loop with Tools
      const agentOptions = {
        model: this.llmService.getGeminiModel(),
        system: systemMessage,
        messages,
        maxSteps: 5,
        tools: {
          searchDatabase: tool({
            description: 'Search the private knowledge base for context and documents.',
            parameters: z.object({
              searchQuery: z.string().describe('The core topic or question to search for.'),
            }),
            execute: async (args: any) => {
              const searchQuery = args.searchQuery;
              this.logger.log(`[Tool] searchDatabase called with args: ${JSON.stringify(args)}`);
              
              if (!searchQuery) {
                return 'Error: You must provide a "searchQuery" parameter.';
              }

              const [queryEmbedding] = await this.llmService.createEmbeddings([searchQuery]);
              const topChunks = await this.vectorSearch.search(searchQuery, queryEmbedding, tenantId, 5);
              if (topChunks.length === 0) return 'No relevant documents found.';
              return topChunks.map((c: any) => `[Document: ${c.metadata?.source || 'Unknown Document'}]\n${c.content}`).join('\n\n');
            },
          } as any),
          sendEmail: tool({
            description: 'Send an email to a user or client.',
            parameters: z.object({
              to: z.string().describe('Email address'),
              subject: z.string(),
              body: z.string()
            }),
            execute: async (args: any) => {
              this.logger.log(`[Tool] sendEmail: ${JSON.stringify(args)}`);
              return 'Email sent successfully.';
            }
          } as any),
          qualifyLead: tool({
            description: 'Determine if a company name is a qualified sales lead.',
            parameters: z.object({ companyName: z.string() }),
            execute: async ({ companyName }: { companyName: string }) => {
              this.logger.log(`[Tool] qualifyLead for ${companyName}`);
              return `${companyName} has an estimated ARR of $5M. Highly qualified.`;
            }
          } as any)
        }
      };

      // 3. ✅ FIX: Save the session to DB BEFORE streaming starts.
      //    Title is set from the first user query so the sidebar shows something meaningful.
      const titleUpdate = query.slice(0, 60).trim() || 'New Chat';
      const existingSession = await this.prisma.chatSession.findUnique({
        where: { id: sessionId },
        select: { title: true }
      });

      const dataToUpdate: any = { updatedAt: new Date() };
      if (history.length === 0) {
        dataToUpdate.title = titleUpdate;
      }

      await this.prisma.chatSession.upsert({
        where: { id: sessionId },
        create: {
          id: sessionId,
          tenantId,
          userId,
          title: titleUpdate,
        },
        update: dataToUpdate,
      });

            let fullAnswer = '';
            // Execute the Agent with Tools (maxSteps: 5 handles the ReAct loop automatically!)
            const result1 = await streamText(agentOptions as any);

            // Read the full stream which includes both text and tool-call events
            for await (const chunk of result1.fullStream) {
              const anyChunk = chunk as any;
              if (anyChunk.type === 'text-delta') {
                const chunkText = anyChunk.text || anyChunk.textDelta || anyChunk.delta || '';
                if (chunkText) {
                  fullAnswer += chunkText;
                  subscriber.next({
                    data: { type: 'chunk', text: chunkText }
                  });
                }
              } else if (anyChunk.type === 'tool-call') {
                subscriber.next({
                  data: { 
                    type: 'tool', 
                    toolName: anyChunk.toolName,
                    args: anyChunk.args || anyChunk.input || {}
                  }
                });
              }
            }

            // After stream is complete, persist the messages to DB
            await this.prisma.chatMessage.createMany({
              data: [
                { sessionId, tenantId, role: 'user', content: query },
                { sessionId, tenantId, role: 'assistant', content: fullAnswer },
              ],
            });

            subscriber.next({ data: { type: 'done' } });
            subscriber.complete();
          } catch (error) {
            this.logger.error(`Error streaming chunks: ${error.message}`);
            require('fs').writeFileSync('debug-error.log', error.stack || error.message);
            subscriber.error(error);
          }
        })();
      });
  }
}
