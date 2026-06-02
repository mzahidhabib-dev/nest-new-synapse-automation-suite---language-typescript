import { Test, TestingModule } from '@nestjs/testing';
import { ChunkerService } from './chunker.service';

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

  it('should return empty array for empty string', () => {
    expect(service.chunk('')).toEqual([]);
  });

  it('should return empty array for whitespace-only string', () => {
    expect(service.chunk('   \n\t  ')).toEqual([]);
  });

  it('should return a single chunk for short text', () => {
    const text = 'Hello world this is a short sentence.';
    const chunks = service.chunk(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it('should produce multiple chunks for long text', () => {
    // Generate ~1000 words to force multiple chunks (threshold is 375 words)
    const words = Array.from({ length: 1000 }, (_, i) => `word${i}`);
    const text = words.join(' ');
    const chunks = service.chunk(text);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('should have overlap between consecutive chunks', () => {
    // Generate 500 words
    const words = Array.from({ length: 500 }, (_, i) => `word${i}`);
    const text = words.join(' ');
    const chunks = service.chunk(text);

    expect(chunks.length).toBeGreaterThanOrEqual(2);

    // Last words of chunk[0] should appear at start of chunk[1] (overlap)
    const lastWordsOfFirst = chunks[0].split(' ').slice(-35).join(' ');
    const firstWordsOfSecond = chunks[1].split(' ').slice(0, 35).join(' ');
    expect(firstWordsOfSecond).toBe(lastWordsOfFirst);
  });

  it('each chunk should not exceed ~375 words', () => {
    const words = Array.from({ length: 2000 }, (_, i) => `word${i}`);
    const text = words.join(' ');
    const chunks = service.chunk(text);

    for (const chunk of chunks) {
      const wordCount = chunk.split(' ').length;
      expect(wordCount).toBeLessThanOrEqual(375);
    }
  });

  it('should cover all words across chunks (no data loss)', () => {
    const words = Array.from({ length: 800 }, (_, i) => `unique${i}`);
    const text = words.join(' ');
    const chunks = service.chunk(text);

    // Every original word should appear in at least one chunk
    for (const word of words) {
      const found = chunks.some((c) => c.includes(word));
      expect(found).toBe(true);
    }
  });
});
