import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InternalServerErrorException } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';
import { ChatHistory } from './entities/chat-history.entity';

describe('ChatbotService', () => {
  let service: ChatbotService;
  let chatRepo: {
    save: jest.Mock;
    find: jest.Mock;
  };

  beforeEach(() => {
    // Constructor requires an API key; use a fake value for unit tests
    process.env.OPENAI_API_KEY = 'test-key';
  });

  beforeEach(async () => {
    // Mock repository methods used by ChatbotService
    chatRepo = {
      save: jest.fn(),
      find: jest.fn(),
    };

    // Build mini Nest module with a fake ChatHistory repository
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatbotService,
        {
          provide: getRepositoryToken(ChatHistory),
          useValue: chatRepo,
        },
      ],
    }).compile();

    service = module.get<ChatbotService>(ChatbotService);

    // Mock OpenAI client inside service so tests never call real network
    (service as any).openai = {
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
    };
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should save user+assistant messages and return cleaned reply', async () => {
    const dto = { email: 'user@example.com', message: 'Hi bot' };

    chatRepo.find.mockResolvedValue([
      { role: 'user', content: 'Hi bot', createdAt: new Date() },
    ]);

    (service as any).openai.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: '"Hello from AI"' } }],
    });

    const result = await service.generateResponse(dto);

    expect(chatRepo.save).toHaveBeenNthCalledWith(1, {
      email: dto.email,
      role: 'user',
      content: dto.message,
    });
    expect(chatRepo.save).toHaveBeenNthCalledWith(2, {
      email: dto.email,
      role: 'assistant',
      content: 'Hello from AI',
    });
    expect(result).toEqual({
      success: true,
      reply: 'Hello from AI',
      model: 'openrouter/free',
    });
  });

  it('should use fallback model when primary model fails', async () => {
    const dto = { email: 'user@example.com', message: 'Hi bot' };
    chatRepo.find.mockResolvedValue([]);

    (service as any).openai.chat.completions.create
      .mockRejectedValueOnce(new Error('Primary failed'))
      .mockResolvedValueOnce({
        choices: [{ message: { content: '"Fallback reply"' } }],
      });

    const result = await service.generateResponse(dto);

    expect((service as any).openai.chat.completions.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ model: 'openrouter/free' }),
    );
    expect((service as any).openai.chat.completions.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        model: 'meta-llama/llama-3.3-8b-instruct:free',
      }),
    );
    expect(result).toEqual({
      success: true,
      reply: 'Fallback reply',
      model: 'meta-llama/llama-3.3-8b-instruct:free',
    });
  });

  it('should throw when AI returns empty content', async () => {
    const dto = { email: 'user@example.com', message: 'Hi bot' };
    chatRepo.find.mockResolvedValue([]);

    (service as any).openai.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: '' } }],
    });

    await expect(service.generateResponse(dto)).rejects.toThrow(
      'AI failed to respond',
    );
  });

  it('should throw when AI request fails', async () => {
    const dto = { email: 'user@example.com', message: 'Hi bot' };
    chatRepo.find.mockResolvedValue([]);

    (service as any).openai.chat.completions.create.mockRejectedValue(
      new Error('Provider down'),
    );

    await expect(service.generateResponse(dto)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});
