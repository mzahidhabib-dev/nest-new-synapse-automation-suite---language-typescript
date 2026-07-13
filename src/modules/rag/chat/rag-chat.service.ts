import { Injectable, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { generateText, streamText, embedMany, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { VectorSearchService } from '../search/vector-search.service';
import { LlmService } from '../../llm/llm.service';
import { ChatMessageDto } from '../dto/chat-message.dto';
import { PrismaService } from '../prisma.service';
import { AiGatewayService } from '../../security/ai-gateway.service';

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
    private readonly aiGateway: AiGatewayService,
  ) { }

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
          // --- SECURITY LAYER ---
          const securityCheck = await this.aiGateway.processInput(query, tenantId, userId);
          if (securityCheck.blocked) {
            subscriber.next({ data: { type: 'chunk', text: `[System]: Message blocked. ${securityCheck.reason}` } });
            subscriber.next({ data: { type: 'done' } });
            subscriber.complete();
            return;
          }
          const safeQuery = securityCheck.safeMessage;

          // 1. History
          const history = await this.getChatHistory(sessionId, tenantId);
          const messages = [
            ...history.map(m => ({ role: m.role, content: m.content })),
            { role: 'user' as const, content: safeQuery },
          ];

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
            maxSteps: 50,
            onStepFinish: (event) => {
              if (event.toolCalls && event.toolCalls.length > 0) {
                for (const tc of event.toolCalls) {
                  subscriber.next({
                    data: {
                      type: 'tool',
                      toolName: tc.toolName,
                      args: tc.args || {}
                    }
                  });
                }
              }
            },
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
                  const topChunks = await this.vectorSearch.search(searchQuery, queryEmbedding, tenantId, 2);
                  // Build result and ensure it stays well within LLM token budget
                  const rawResult = topChunks.map((c: any) => `[Document: ${c.metadata?.source || 'Unknown Document'}]\n${c.content}`).join('\n\n');
                  const truncatedResult = rawResult.length > 1000 ? rawResult.slice(0, 1000) + '... (truncated)' : rawResult;
                  console.log('[DIAG] searchDatabase → result length:', truncatedResult.length);
                  console.log('[DIAG] searchDatabase → raw output:\n', truncatedResult);
                  return truncatedResult;
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
          const titleUpdate = safeQuery.slice(0, 60).trim() || 'New Chat';
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
          // Execute the Agent with Tools
          const result1 = await streamText(agentOptions as any);

          // Read the text stream
          for await (const chunkText of result1.textStream) {
            if (chunkText) {
              fullAnswer += chunkText;
              subscriber.next({
                data: { type: 'chunk', text: chunkText }
              });
            }
          }

          if (!fullAnswer.trim()) {
            console.log('[DIAG] LLM stream completed – fullAnswer length:', fullAnswer.length);
            fullAnswer = "I've searched the available information, but I couldn't generate a clear response.";
            subscriber.next({
              data: { type: 'chunk', text: fullAnswer }
            });
          }

          // After stream, 4. Save assistant's answer to DB
          await this.prisma.chatMessage.createMany({
            data: [
              { sessionId, tenantId, role: 'user', content: safeQuery },
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
