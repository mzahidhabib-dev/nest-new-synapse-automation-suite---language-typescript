import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException } from '@nestjs/common';
import { EmbedderService } from './embedder.service';
import { LlmService } from '../../llm/llm.service';

describe('EmbedderService', () => {
  let service: EmbedderService;
  let llmService: jest.Mocked<LlmService>;

  beforeEach(async () => {
    // Mock LlmService so we never hit real API
    const mockLlmService: jest.Mocked<Partial<LlmService>> = {
      createEmbeddings: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmbedderService,
        { provide: LlmService, useValue: mockLlmService },
      ],
    }).compile();

    service = module.get<EmbedderService>(EmbedderService);
    llmService = module.get(LlmService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return empty array when given no chunks', async () => {
    const result = await service.embedMany([]);
    expect(result).toEqual([]);
    expect(llmService.createEmbeddings).not.toHaveBeenCalled();
  });

  it('should call LlmService.createEmbeddings with the chunks', async () => {
    const fakeEmbedding = Array(1536).fill(0.1);
    llmService.createEmbeddings.mockResolvedValue([fakeEmbedding]);

    const chunks = ['chunk one'];
    const result = await service.embedMany(chunks);

    expect(llmService.createEmbeddings).toHaveBeenCalledWith(chunks);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(fakeEmbedding);
  });

  it('should return 1536-dimensional embeddings', async () => {
    const fakeEmbedding = Array(1536).fill(0.5);
    llmService.createEmbeddings.mockResolvedValue([fakeEmbedding, fakeEmbedding]);

    const result = await service.embedMany(['chunk a', 'chunk b']);

    expect(result).toHaveLength(2);
    result.forEach((emb) => expect(emb).toHaveLength(1536));
  });

  it('should process chunks in batches of 100', async () => {
    // 150 chunks → should call createEmbeddings twice (batch 1: 100, batch 2: 50)
    const fakeEmbedding = Array(1536).fill(0.1);
    llmService.createEmbeddings.mockResolvedValue(
      Array(100).fill(fakeEmbedding),
    );

    const chunks = Array.from({ length: 150 }, (_, i) => `chunk ${i}`);
    await service.embedMany(chunks);

    expect(llmService.createEmbeddings).toHaveBeenCalledTimes(2);
    expect(llmService.createEmbeddings).toHaveBeenNthCalledWith(
      1,
      chunks.slice(0, 100),
    );
    expect(llmService.createEmbeddings).toHaveBeenNthCalledWith(
      2,
      chunks.slice(100),
    );
  });

  it('should throw InternalServerErrorException when LlmService fails', async () => {
    llmService.createEmbeddings.mockRejectedValue(new Error('API down'));

    await expect(service.embedMany(['some chunk'])).rejects.toThrow(
      InternalServerErrorException,
    );
  });
});
