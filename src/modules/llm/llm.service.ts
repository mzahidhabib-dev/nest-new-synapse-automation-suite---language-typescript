import { Injectable } from '@nestjs/common';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText, streamText, embedMany } from 'ai';
import { LlmConfigService } from './llm.config';

@Injectable()
export class LlmService {
  constructor(private readonly config: LlmConfigService) { }

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

  /** Streams Gemini response (Vercel AI SDK). */
  async streamGemini(prompt: string) {
    const model = this.getGeminiModel();
    const result = await streamText({
      model,
      prompt,
      temperature: this.config.temperature,
      maxOutputTokens: this.config.maxTokens,
    });
    return result.textStream;
  }

  /** Exposes the configured model for Agent workflows */
  getGeminiModel() {
    const google = createGoogleGenerativeAI({
      apiKey: this.config.geminiApiKey,
    });
    return google(this.config.geminiModel);
  }

  /** Generates vector embeddings using gemini-embedding-001 truncated to 1536-dim. */
  async createEmbeddings(texts: string[]): Promise<number[][]> {
    const google = createGoogleGenerativeAI({
      apiKey: this.config.geminiApiKey,
    });

    try {
      const { embeddings } = await embedMany({
        model: google.textEmbeddingModel('gemini-embedding-001'),
        values: texts,
      });

      // gemini-embedding-001 natively outputs 3072 dims.
      // We manually truncate to 1536 to stay within pgvector's ivfflat 2000-dim index limit.
      // (Gemini uses Matryoshka representation learning, so slicing the array works perfectly).
      return embeddings.map((emb) => emb.slice(0, 1536));
    } catch (error) {
      console.error('Failed to create embeddings via Google AI SDK:', error);
      throw error;
    }
  }

  /**
   * Re-ranks a set of document chunks by asking the LLM to score their relevance
   * to the user's query from 0 to 10.
   */
  async rerankChunks(query: string, chunks: any[]): Promise<{ index: number; score: number }[]> {
    if (!chunks || chunks.length === 0) return [];

    const prompt = `
You are a strict relevance grader. 
I will provide a user query and a list of document chunks. 
Score each chunk from 0 to 10 based STRICTLY on whether it contains information that helps answer the user's query.
A score of 0 means completely irrelevant. A score of 10 means it directly answers the query.
Be extremely strict. If a chunk is only tangentially related, give it a low score (e.g., 2 or 3).

User Query: "${query}"

Chunks:
${chunks.map((chunk, index) => `[Chunk ${index}]\n${chunk.content}`).join('\n\n')}

Return ONLY a valid JSON array of objects in this exact format:
[
  { "index": 0, "score": 8 },
  { "index": 1, "score": 2 }
]
`;

    const responseText = await this.callGemini(prompt);

    try {
      // Find JSON array in the response (handles markdown formatting if present)
      const match = responseText.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('No JSON array found in response');

      const scores = JSON.parse(match[0]);
      return scores;
    } catch (error) {
      console.error('Failed to parse re-ranking scores from LLM:', responseText, error);
      // Fallback: return default scores so the pipeline doesn't break
      return chunks.map((_, index) => ({ index, score: 5 }));
    }
  }
}
