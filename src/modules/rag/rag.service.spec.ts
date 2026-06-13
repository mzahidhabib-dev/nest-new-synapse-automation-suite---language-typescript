import { Test, TestingModule } from '@nestjs/testing';
import { RagService } from './rag.service';
import { ExtractorService } from './pipeline/extractor.service';
import { ChunkerService } from './pipeline/chunker.service';
import { EmbedderService } from './pipeline/embedder.service';
import { PrismaService } from './prisma.service';

describe('RagService', () => {
  let service: RagService;

  const mockExtractor = { extract: jest.fn() };
  const mockChunker = { chunk: jest.fn() };
  const mockEmbedder = { embedMany: jest.fn() };
  const mockPrisma = {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
    document: {
      update: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    chatSession: { count: jest.fn() },
    documentChunk: { count: jest.fn() },
    rateLimit: { count: jest.fn() },
    auditLog: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RagService,
        { provide: ExtractorService, useValue: mockExtractor },
        { provide: ChunkerService, useValue: mockChunker },
        { provide: EmbedderService, useValue: mockEmbedder },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RagService>(RagService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});