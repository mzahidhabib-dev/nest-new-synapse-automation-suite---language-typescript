import { Injectable } from '@nestjs/common';

@Injectable()
export class ChunkerService {
  private readonly approxWordsPerChunk = 375; // ~500 tokens
  private readonly approxOverlapWords = 35;   // ~50 tokens

  /**
   * Chunks a given text string using a sliding word-window.
   * Approximation: ~375 words per chunk with 35-word overlap.
   */
  chunk(text: string): string[] {
    if (!text || text.trim() === '') {
      return [];
    }

    const words = text.split(/\s+/);
    const chunks: string[] = [];
    const step = this.approxWordsPerChunk - this.approxOverlapWords;

    for (let i = 0; i < words.length; i += step) {
      const chunkWords = words.slice(i, i + this.approxWordsPerChunk);
      chunks.push(chunkWords.join(' '));
    }

    return chunks;
  }
}