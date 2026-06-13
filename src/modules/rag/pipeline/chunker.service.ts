import { Injectable } from '@nestjs/common';
import { ExtractedPage } from './extractor.service';

/**
 * A single chunk of text, with full metadata about its origin.
 * This metadata is stored in the DB and used for citations in answers.
 */
export interface Chunk {
  content: string;
  metadata: {
    page: number;       // real page number from the source document
    chunkIndex: number; // global index across all chunks of the document
    source: string;     // original filename, e.g. "company-policy.pdf"
  };
}

@Injectable()
export class ChunkerService {
  private readonly maxCharsPerChunk = 2000; // ~500 tokens
  private readonly overlapSentences = 2;    // overlap for context continuity

  /**
   * Chunks a list of extracted pages into smaller Chunk objects.
   * Each chunk carries the page number it came from and the source filename.
   * This enables accurate citations like [Source: policy.pdf, Page 3].
   */
  chunk(pages: ExtractedPage[], source: string): Chunk[] {
    const chunks: Chunk[] = [];
    let globalIndex = 0;

    for (const page of pages) {
      const pageChunks = this.chunkText(page.text);

      for (const content of pageChunks) {
        chunks.push({
          content,
          metadata: {
            page: page.pageNumber,
            chunkIndex: globalIndex++,
            source,
          },
        });
      }
    }

    return chunks;
  }

  /**
   * Splits a single page's text into sentence-boundary chunks with overlap.
   */
  private chunkText(text: string): string[] {
    if (!text || text.trim() === '') {
      return [];
    }

    // Intl.Segmenter gives clean sentence boundaries across languages
    const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
    const segments = Array.from(segmenter.segment(text))
      .map(s => s.segment.trim())
      .filter(s => s.length > 0);

    const chunks: string[] = [];
    let currentChunkSentences: string[] = [];
    let currentChunkLength = 0;

    for (const sentence of segments) {
      const sentenceLength = sentence.length + (currentChunkSentences.length > 0 ? 1 : 0);

      if (currentChunkLength + sentenceLength > this.maxCharsPerChunk && currentChunkSentences.length > 0) {
        // Finalize current chunk
        chunks.push(currentChunkSentences.join(' '));
        // Start new chunk with overlap for context continuity
        const overlap = currentChunkSentences.slice(-this.overlapSentences);
        currentChunkSentences = [...overlap, sentence];
        currentChunkLength = currentChunkSentences.join(' ').length;
      } else {
        currentChunkSentences.push(sentence);
        currentChunkLength += sentenceLength;
      }
    }

    if (currentChunkSentences.length > 0) {
      chunks.push(currentChunkSentences.join(' '));
    }

    return chunks;
  }
}