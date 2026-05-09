import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatHistory } from './entities/chat-history.entity';
import { ChatRequestDto } from './dto/chat-request.dto';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);
  private openai: OpenAI;
  private groq: OpenAI;
  private openaiSdk: ReturnType<typeof createOpenAI>;
  private readonly groqModel = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  private readonly primaryModel = process.env.AI_PRIMARY_MODEL || 'openrouter/free';
  private readonly fallbackModel =
    process.env.AI_FALLBACK_MODEL || 'meta-llama/llama-3.3-8b-instruct:free';
  private readonly inputCostPer1k = Number(process.env.AI_INPUT_COST_PER_1K || '0');
  private readonly outputCostPer1k = Number(process.env.AI_OUTPUT_COST_PER_1K || '0');
  private readonly temperature = this.parseTemperature(process.env.AI_TEMPERATURE, 0.3);
  private readonly maxOutputTokens = this.parsePositiveInt(
    process.env.AI_MAX_OUTPUT_TOKENS,
    220,
  );

  constructor(
    @InjectRepository(ChatHistory)
    private readonly chatRepo: Repository<ChatHistory>,
  ) {
    const apiKey = process.env.OPENAI_API_KEY;
    const groqApiKey = process.env.GROQ_API_KEY;

    this.openai = new OpenAI({
      apiKey: apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Synapse Automation Suite',
      },
    });

    this.groq = new OpenAI({
      apiKey: groqApiKey,
      baseURL: 'https://api.groq.com/openai/v1',
    });

    this.openaiSdk = createOpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
    });

    this.logger.log(
      `AI clients configured openRouter=${Boolean(apiKey)} groq=${Boolean(
        groqApiKey,
      )} groqModel=${this.groqModel}`,
    );
  }

  async generateResponse(dto: ChatRequestDto, requestId = this.createRequestId()) {
    const startedAt = Date.now();
    const { message, email } = dto;

    // 1. Save the new User Message to DB immediately
    const saveUserStartedAt = Date.now();
    await this.chatRepo.save({ email, role: 'user', content: message });
    this.logStep(requestId, '/ask user message saved', startedAt, saveUserStartedAt);

    // 2. Fetch last 6 messages (to include the one we just saved + previous context)
    const historyStartedAt = Date.now();
    const history = await this.chatRepo.find({
      where: { email },
      order: { createdAt: 'DESC' },
      take: 6,
    });
    this.logStep(requestId, '/ask history fetched', startedAt, historyStartedAt, {
      historyCount: history.length,
    });

    // 3. Format history for the AI (Chronological order)
    const formattedHistory: ChatCompletionMessageParam[] = history.reverse().map((h) => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    }));

    // 4. Define the Expert Persona
    const systemPrompt = `
You are an AI assistant for a Senior Full-Stack Developer's portfolio website.

## YOUR IDENTITY:
- Role: Senior Full-Stack Developer
- Experience: 3+ years professional
- Title: "Synapse Suite Lead Architect"

## YOUR EXACT SKILLS (DO NOT ADD OR REMOVE):

### FRONTEND (Expert):
- React, Next.js, TypeScript, Vite
- Basic knowledge only (not expert): Angular, Vue

### BACKEND (Expert):
- Node.js, NestJS, PHP/Laravel
- NOT experienced: Python, Django, Ruby, Go, Java, C#

### DATABASE (Expert):
- MySQL, PostgreSQL, MongoDB
- Dockerized database setups

### REAL-TIME (Expert):
- WebSockets, Socket.io

### AUTOMATION (Expert):
- n8n, Zapier

### DEPLOYMENT/CI-CD (Working knowledge):
- AWS, Vercel, Railway, Render

## WHAT YOU CAN DISCUSS:
- Technical questions about listed skills
- Project feasibility using listed technologies
- Portfolio work examples (if provided in context)
- Freelance availability (share email: ${email})

## STRICT BOUNDARIES:
❌ DO NOT claim skills NOT in the list above
❌ DO NOT answer non-portfolio questions (e.g., "explain quantum physics", "help with taxes")
❌ DO NOT share pricing (say: "Please contact via email for custom quotes")
❌ DO NOT guarantee timelines (say: "Timelines depend on project scope")
❌ DO NOT invent projects or case studies
❌ DO NOT discuss other developers or agencies

## WHEN UNCERTAIN:
1. If question is off-topic → "I'm designed to discuss my technical skills and freelance availability only. For other questions, please email ${email}"
2. If skill not listed → "I don't have professional experience with [X]. My expertise is in [list relevant skills]"
3. If pricing asked → "For accurate pricing, please email ${email} with your project requirements"

## RESPONSE FORMAT:
- Be concise (2-4 sentences typical)
- Offer to elaborate on specific technologies
- End with an action question when relevant

## EXAMPLE GOOD RESPONSES:
Q: "Can you build a real-time dashboard?"
A: "Yes — with NestJS backend, WebSockets for real-time updates, and React/Next.js frontend. Would you like to discuss your specific requirements?"

Q: "Do you know Python?"
A: "Python isn't in my core stack. My backend expertise is Node.js/NestJS and PHP/Laravel. Are you open to those technologies?"

## CONTEXT FROM PORTFOLIO (if not provided):
 "No additional portfolio data provided."}
`;

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...formattedHistory,
    ];
    const modelsToTry = [this.groqModel];
    const modelErrors: string[] = [];

    let reply: string | null = null;
    let usedModel: string | null = null;
    let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null =
      null;

    for (const model of modelsToTry) {
      const modelStartedAt = Date.now();
      this.logger.log(`[${requestId}] /ask model attempt started model=${model}`);
      try {
        const response = await this.groq.chat.completions.create({
          model,
          messages,
          temperature: this.temperature,
          max_tokens: this.maxOutputTokens,
        });

        let modelReply = response.choices[0]?.message?.content;
        if (modelReply) {
          modelReply = modelReply.replace(/^["']|["']$/g, '').trim();
        }

        if (!modelReply) {
          modelErrors.push(`${model}: empty response`);
          continue;
        }

        reply = modelReply;
        usedModel = model;
        usage = {
          promptTokens: response.usage?.prompt_tokens ?? 0,
          completionTokens: response.usage?.completion_tokens ?? 0,
          totalTokens: response.usage?.total_tokens ?? 0,
        };
        this.logStep(requestId, '/ask model attempt succeeded', startedAt, modelStartedAt, {
          model,
          replyLength: reply.length,
          totalTokens: usage.totalTokens,
        });
        break;
      } catch (error) {
        this.logStep(requestId, '/ask model attempt failed', startedAt, modelStartedAt, {
          model,
          error: error instanceof Error ? error.message : 'unknown error',
        });
        modelErrors.push(`${model}: request failed`);
      }
    }

    if (!reply || !usedModel) {
      console.error('AI Error:', modelErrors.join(' | '));
      throw new InternalServerErrorException('AI failed to respond');
    }

    const estimatedCostUsd = this.calculateEstimatedCost(usage);

    // 6. Save AI Reply to DB
    const saveAssistantStartedAt = Date.now();
    await this.chatRepo.save({
      email,
      role: 'assistant',
      content: reply,
      model: usedModel,
      promptTokens: usage?.promptTokens ?? 0,
      completionTokens: usage?.completionTokens ?? 0,
      totalTokens: usage?.totalTokens ?? 0,
      estimatedCostUsd: estimatedCostUsd.toFixed(6),
    });
    this.logStep(requestId, '/ask assistant message saved', startedAt, saveAssistantStartedAt);

    console.log('AI Usage:', {
      email,
      model: usedModel,
      promptTokens: usage?.promptTokens ?? 0,
      completionTokens: usage?.completionTokens ?? 0,
      totalTokens: usage?.totalTokens ?? 0,
      estimatedCostUsd,
    });
    this.logger.log(
      `[${requestId}] /ask service completed totalMs=${Date.now() - startedAt} model=${usedModel}`,
    );

    return {
      success: true,
      reply,
      model: usedModel,
      usage: usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      estimatedCostUsd,
    };
  }

  async generateStreamingResponse(
    dto: ChatRequestDto,
    onToken: (token: string) => void,
    requestId = this.createRequestId(),
  ) {
    const startedAt = Date.now();
    const { message, email } = dto;

    const saveUserStartedAt = Date.now();
    await this.chatRepo.save({ email, role: 'user', content: message });
    this.logStep(requestId, '/stream user message saved', startedAt, saveUserStartedAt);

    const historyStartedAt = Date.now();
    const history = await this.chatRepo.find({
      where: { email },
      order: { createdAt: 'DESC' },
      take: 6,
    });
    this.logStep(requestId, '/stream history fetched', startedAt, historyStartedAt, {
      historyCount: history.length,
    });

    const formattedHistory: ChatCompletionMessageParam[] = history.reverse().map((h) => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    }));

  const systemPrompt = `
You are an AI assistant for a Senior Full-Stack Developer's portfolio website.

## YOUR IDENTITY:
- Role: Senior Full-Stack Developer
- Experience: 3+ years professional
- Title: "Synapse Suite Lead Architect"

## YOUR EXACT SKILLS (DO NOT ADD OR REMOVE):

### FRONTEND (Expert):
- React, Next.js, TypeScript, Vite
- Basic knowledge only (not expert): Angular, Vue

### BACKEND (Expert):
- Node.js, NestJS, PHP/Laravel
- NOT experienced: Python, Django, Ruby, Go, Java, C#

### DATABASE (Expert):
- MySQL, PostgreSQL, MongoDB
- Dockerized database setups

### REAL-TIME (Expert):
- WebSockets, Socket.io

### AUTOMATION (Expert):
- n8n, Zapier

### DEPLOYMENT/CI-CD (Working knowledge):
- AWS, Vercel, Railway, Render

## WHAT YOU CAN DISCUSS:
- Technical questions about listed skills
- Project feasibility using listed technologies
- Portfolio work examples (if provided in context)
- Freelance availability (share email: ${email})

## STRICT BOUNDARIES:
❌ DO NOT claim skills NOT in the list above
❌ DO NOT answer non-portfolio questions (e.g., "explain quantum physics", "help with taxes")
❌ DO NOT share pricing (say: "Please contact via email for custom quotes")
❌ DO NOT guarantee timelines (say: "Timelines depend on project scope")
❌ DO NOT invent projects or case studies
❌ DO NOT discuss other developers or agencies

## WHEN UNCERTAIN:
1. If question is off-topic → "I'm designed to discuss my technical skills and freelance availability only. For other questions, please email ${email}"
2. If skill not listed → "I don't have professional experience with [X]. My expertise is in [list relevant skills]"
3. If pricing asked → "For accurate pricing, please email ${email} with your project requirements"

## RESPONSE FORMAT:
- Be concise (2-4 sentences typical)
- Offer to elaborate on specific technologies
- End with an action question when relevant

## EXAMPLE GOOD RESPONSES:
Q: "Can you build a real-time dashboard?"
A: "Yes — with NestJS backend, WebSockets for real-time updates, and React/Next.js frontend. Would you like to discuss your specific requirements?"

Q: "Do you know Python?"
A: "Python isn't in my core stack. My backend expertise is Node.js/NestJS and PHP/Laravel. Are you open to those technologies?"

## CONTEXT FROM PORTFOLIO (if not provided):
"No additional portfolio data provided."
`;

    const messages: ChatCompletionMessageParam[] = formattedHistory;
    const modelsToTry = [this.groqModel];
    const modelErrors: string[] = [];

    let fullReply = '';
    let usedModel: string | null = null;
    let tokenCount = 0;
    let firstTokenMs: number | null = null;

    for (const model of modelsToTry) {
      const modelStartedAt = Date.now();
      this.logger.log(`[${requestId}] /stream model attempt started model=${model}`);
      try {
        const stream = await this.groq.chat.completions.create({
          model,
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          temperature: this.temperature,
          max_tokens: this.maxOutputTokens,
          stream: true,
        });

        fullReply = '';
        for await (const chunk of stream) {
          const token = chunk.choices[0]?.delta?.content || '';
          if (token) {
            tokenCount += 1;
            if (firstTokenMs === null) {
              firstTokenMs = Date.now() - startedAt;
              this.logger.log(
                `[${requestId}] /stream first token received totalMs=${firstTokenMs} model=${model}`,
              );
            }
            fullReply += token;
            onToken(token);
          }
        }

        fullReply = fullReply.replace(/^["']|["']$/g, '').trim();
        if (!fullReply) {
          modelErrors.push(`${model}: empty response`);
          continue;
        }

        usedModel = model;
        this.logStep(requestId, '/stream model attempt succeeded', startedAt, modelStartedAt, {
          model,
          tokenCount,
          replyLength: fullReply.length,
          firstTokenMs,
        });
        break;
      } catch (error) {
        this.logStep(requestId, '/stream model attempt failed', startedAt, modelStartedAt, {
          model,
          tokenCount,
          error: error instanceof Error ? error.message : 'unknown error',
        });
        modelErrors.push(`${model}: request failed`);
      }
    }

    if (!usedModel || !fullReply) {
      console.error('AI Stream Error:', modelErrors.join(' | '));
      throw new InternalServerErrorException('AI failed to stream response');
    }

    const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    const estimatedCostUsd = this.calculateEstimatedCost(usage);

    const saveAssistantStartedAt = Date.now();
    await this.chatRepo.save({
      email,
      role: 'assistant',
      content: fullReply,
      model: usedModel,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: estimatedCostUsd.toFixed(6),
    });
    this.logStep(
      requestId,
      '/stream assistant message saved',
      startedAt,
      saveAssistantStartedAt,
    );

    console.log('AI Stream Usage:', {
      email,
      model: usedModel,
      estimatedCostUsd,
    });
    this.logger.log(
      `[${requestId}] /stream service completed totalMs=${Date.now() - startedAt} model=${usedModel} tokenCount=${tokenCount} firstTokenMs=${firstTokenMs}`,
    );

    return {
      success: true,
      reply: fullReply,
      model: usedModel,
      usage,
      estimatedCostUsd,
    };
  }

  private calculateEstimatedCost(
    usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null,
  ): number {
    if (!usage) {
      return 0;
    }

    const inputCost = (usage.promptTokens / 1000) * this.inputCostPer1k;
    const outputCost = (usage.completionTokens / 1000) * this.outputCostPer1k;
    return Number((inputCost + outputCost).toFixed(6));
  }

  private parseTemperature(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(1, Math.max(0, parsed));
  }

  private parsePositiveInt(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return fallback;
    }
    return parsed;
  }

  private logStep(
    requestId: string,
    step: string,
    requestStartedAt: number,
    stepStartedAt: number,
    extra: Record<string, unknown> = {},
  ): void {
    const extraText = Object.entries(extra)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(' ');

    this.logger.log(
      `[${requestId}] ${step} stepMs=${Date.now() - stepStartedAt} totalMs=${Date.now() - requestStartedAt
      }${extraText ? ` ${extraText}` : ''}`,
    );
  }

  private createRequestId(): string {
    return Math.random().toString(36).slice(2, 8);
  }
}
