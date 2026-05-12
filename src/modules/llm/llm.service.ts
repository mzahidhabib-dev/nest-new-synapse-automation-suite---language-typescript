import { Injectable } from '@nestjs/common';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';
import { LlmConfigService } from './llm.config';

@Injectable()
export class LlmService {
  constructor(private readonly config: LlmConfigService) {}

  /** Groq via OpenAI-compatible API (Vercel AI SDK + @ai-sdk/openai). */
  async callGroq(prompt: string, jsonMode = false): Promise<string> {
    const groq = createOpenAI({
      apiKey: this.config.groqApiKey,
      baseURL: 'https://api.groq.com/openai/v1',
    });
    const { text } = await generateText({
      model: groq(this.config.groqModel),
      prompt,
      temperature: this.config.temperature,
      maxOutputTokens: this.config.maxTokens,
    });
    return text ?? '';
  }

  /** Google Generative AI (Vercel AI SDK + @ai-sdk/google). */
  async callGemini(prompt: string): Promise<string> {
    const google = createGoogleGenerativeAI({
      apiKey: this.config.geminiApiKey,
    });
    const { text } = await generateText({
      model: google(this.config.geminiModel),
      prompt,
      temperature: this.config.temperature,
      maxOutputTokens: this.config.maxTokens,
    });
    return text ?? '';
  }
}
