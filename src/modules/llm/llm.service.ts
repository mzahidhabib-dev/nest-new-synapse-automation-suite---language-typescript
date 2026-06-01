import { Injectable } from '@nestjs/common';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText, embedMany } from 'ai';
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

  /** Generates vector embeddings using gemini-embedding-001 (3072-dim, v1beta). */
  async createEmbeddings(texts: string[]): Promise<number[][]> {
    // gemini-embedding-001 is confirmed available on the v1beta endpoint (3072-dim output)
    const google = createGoogleGenerativeAI({
      apiKey: this.config.geminiApiKey,
    });

    try {
      const { embeddings } = await embedMany({
        model: google.textEmbeddingModel('gemini-embedding-001'),
        values: texts,
      });
      return embeddings;
    } catch (error) {
      console.error('Failed to create embeddings via Google AI SDK:', error);
      throw error;
    }
  }
}