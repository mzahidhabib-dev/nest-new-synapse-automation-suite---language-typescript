import { Test, TestingModule } from '@nestjs/testing';
import { ChunkerService } from './chunker.service';
import { ExtractedPage } from './extractor.service';

describe('ChunkerService', () => {
  let service: ChunkerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChunkerService],
    }).compile();

    service = module.get<ChunkerService>(ChunkerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return empty array for empty pages', () => {
    expect(service.chunk([], 'test.pdf')).toEqual([]);
  });

  it('should return empty array for pages with whitespace-only text', () => {
    const pages: ExtractedPage[] = [{ pageNumber: 1, text: '   \n\t  ' }];
    expect(service.chunk(pages, 'test.pdf')).toEqual([]);
  });

  it('should return a single chunk for short text with correct metadata', () => {
    const text = 'Hello world this is a short sentence.';
    const pages: ExtractedPage[] = [{ pageNumber: 1, text }];
    const chunks = service.chunk(pages, 'test.pdf');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe(text);
    expect(chunks[0].metadata.page).toBe(1);
    expect(chunks[0].metadata.source).toBe('test.pdf');
    expect(chunks[0].metadata.chunkIndex).toBe(0);
  });

  it('should produce multiple chunks for long text', () => {
    const words = Array.from({ length: 1000 }, (_, i) => `word${i}`);
    const pages: ExtractedPage[] = [{ pageNumber: 1, text: words.join(' ') }];
    const chunks = service.chunk(pages, 'test.pdf');
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('should have overlap between consecutive chunks', () => {
    const words = Array.from({ length: 500 }, (_, i) => `word${i}`);
    const pages: ExtractedPage[] = [{ pageNumber: 1, text: words.join(' ') }];
    const chunks = service.chunk(pages, 'test.pdf');

    expect(chunks.length).toBeGreaterThanOrEqual(2);

    // Last words of chunk[0] should appear at start of chunk[1] (overlap)
    const lastWordsOfFirst = chunks[0].content.split(' ').slice(-35).join(' ');
    const firstWordsOfSecond = chunks[1].content.split(' ').slice(0, 35).join(' ');
    expect(firstWordsOfSecond).toBe(lastWordsOfFirst);
  });

  it('each chunk should not exceed ~375 words', () => {
    const words = Array.from({ length: 2000 }, (_, i) => `word${i}`);
    const pages: ExtractedPage[] = [{ pageNumber: 1, text: words.join(' ') }];
    const chunks = service.chunk(pages, 'test.pdf');

    for (const chunk of chunks) {
      const wordCount = chunk.content.split(' ').length;
      expect(wordCount).toBeLessThanOrEqual(375);
    }
  });

  it('should cover all words across chunks (no data loss)', () => {
    const words = Array.from({ length: 800 }, (_, i) => `unique${i}`);
    const pages: ExtractedPage[] = [{ pageNumber: 1, text: words.join(' ') }];
    const chunks = service.chunk(pages, 'test.pdf');

    // Every original word should appear in at least one chunk
    for (const word of words) {
      const found = chunks.some((c) => c.content.includes(word));
      expect(found).toBe(true);
    }
  });

  it('should assign correct page numbers from multiple pages', () => {
    const pages: ExtractedPage[] = [
      { pageNumber: 1, text: 'Page one content here.' },
      { pageNumber: 2, text: 'Page two content here.' },
    ];
    const chunks = service.chunk(pages, 'doc.pdf');
    expect(chunks[0].metadata.page).toBe(1);
    expect(chunks[1].metadata.page).toBe(2);
  });
});
