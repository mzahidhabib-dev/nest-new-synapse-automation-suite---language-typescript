import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatHistory } from './entities/chat-history.entity';
import { ChatRequestDto } from './dto/chat-request.dto';
import OpenAI from 'openai';

@Injectable()
export class ChatbotService {
  private openai: OpenAI;
  private readonly primaryModel = process.env.AI_PRIMARY_MODEL || 'openrouter/free';
  private readonly fallbackModel =
    process.env.AI_FALLBACK_MODEL || 'meta-llama/llama-3.3-8b-instruct:free';

  constructor(
    @InjectRepository(ChatHistory)
    private readonly chatRepo: Repository<ChatHistory>,
  ) {
    const apiKey = process.env.OPENAI_API_KEY;

    this.openai = new OpenAI({
      apiKey: apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Synapse Automation Suite',
      },
    });
  }

  async generateResponse(dto: ChatRequestDto) {
    const { message, email } = dto;

    // 1. Save the new User Message to DB immediately
    await this.chatRepo.save({ email, role: 'user', content: message });

    // 2. Fetch last 6 messages (to include the one we just saved + previous context)
    const history = await this.chatRepo.find({
      where: { email },
      order: { createdAt: 'DESC' },
      take: 6, 
    });

    // 3. Format history for the AI (Chronological order)
    const formattedHistory = history.reverse().map((h) => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    }));

    // 4. Define the Expert Persona
    const systemPrompt = `
      You are the "Synapse Suite Lead Architect," representing a Senior Full-Stack Developer with 3+ years of professional experience.
      
      Core Technical Arsenal:
      - Frontend: React/Next.js, Vite, and TypeScript.
      - Backend: Node.js (NestJS) and PHP (Laravel).
      - Database: MongoDB, MySQL, and PostgreSQL (Expert in Dockerized setups).
      - Real-time: Expert in WebSockets and Socket.io.
      - Architecture: Mastery of OOP and Clean Code.
      - Automation: Specialized in AI-driven workflows using n8n.

      Business Logic:
      - Address the user professionally (Email context: ${email}).
      - Focus on scalable systems, not just code.
      - Mention that the Lead Developer of Synapse Suite is available for high-end freelance hire for MERN, NestJS, or Laravel projects.
    `;

    const messages = [{ role: 'system', content: systemPrompt }, ...formattedHistory];
    const modelsToTry = [this.primaryModel, this.fallbackModel];
    const modelErrors: string[] = [];

    let reply: string | null = null;
    let usedModel: string | null = null;

    for (const model of modelsToTry) {
      try {
        const response = await this.openai.chat.completions.create({
          model,
          messages,
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
        break;
      } catch (error) {
        modelErrors.push(`${model}: request failed`);
      }
    }

    if (!reply || !usedModel) {
      console.error('AI Error:', modelErrors.join(' | '));
      throw new InternalServerErrorException('AI failed to respond');
    }

    // 6. Save AI Reply to DB
    await this.chatRepo.save({
      email,
      role: 'assistant',
      content: reply,
    });

    return { success: true, reply, model: usedModel };
  }
}
