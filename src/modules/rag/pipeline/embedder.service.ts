import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
// Adjust the import path to your actual LlmService location
import { LlmService } from '../../llm/llm.service'; 

@Injectable()
export class EmbedderService {
  private readonly logger = new Logger(EmbedderService.name);
  private readonly batchSize = 100; // OpenAI's recommended max per request

  constructor(private readonly llmService: LlmService) {}

  /**
   * Takes an array of text chunks and returns their vector embeddings.
   */
  async embedMany(chunks: string[]): Promise<number[][]> {
    if (!chunks || chunks.length === 0) {
      return [];
    }

    const allEmbeddings: number[][] = [];

    try {
      // Process chunks in batches to respect rate limits
      for (let i = 0; i < chunks.length; i += this.batchSize) {
        const batch = chunks.slice(i, i + this.batchSize);
        
        // This assumes your LlmService has an 'embed' or similar method.
        // If your LlmService doesn't have this yet, you'll need to add it!
        // The typical OpenAI call looks like: 
        // await openai.embeddings.create({ model: 'text-embedding-3-small', input: batch })
        const batchEmbeddings = await this.llmService.createEmbeddings(batch);
        
        allEmbeddings.push(...batchEmbeddings);
        
        this.logger.log(`Embedded batch ${i / this.batchSize + 1} of ${Math.ceil(chunks.length / this.batchSize)}`);
      }

      return allEmbeddings;
    } catch (error) {
      this.logger.error('Failed to generate embeddings', error.stack);
      throw new InternalServerErrorException('Error communicating with embedding provider.');
    }
  }
}