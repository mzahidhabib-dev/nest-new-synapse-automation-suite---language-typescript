import { Test, TestingModule } from '@nestjs/testing';
import { RagController } from './rag.controller';
import { RagService } from './rag.service';
import { RagChatService } from './chat/rag-chat.service';
import { PrismaService } from './prisma.service';

describe('RagController', () => {
  let controller: RagController;

  const mockRagService = {
    processDocument: jest.fn(),
    getAllDocuments: jest.fn(),
    deleteDocument: jest.fn(),
    getAdminStats: jest.fn(),
    getClientStats: jest.fn(),
  };
  const mockChatService = {
    chatStream: jest.fn(),
    getChatHistory: jest.fn(),
  };
  const mockPrisma = {
    document: { deleteMany: jest.fn() },
    chatSession: { deleteMany: jest.fn() },
    auditLog: { deleteMany: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RagController],
      providers: [
        { provide: RagService, useValue: mockRagService },
        { provide: RagChatService, useValue: mockChatService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    controller = module.get<RagController>(RagController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});