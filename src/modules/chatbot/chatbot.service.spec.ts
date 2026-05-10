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
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.GEMINI_MODEL = 'gemini-1.5-flash';
    process.env.AI_INPUT_COST_PER_1K = '0';
    process.env.AI_OUTPUT_COST_PER_1K = '0';
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
    (service as any).groq = {
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
    };
    (service as any).gemini = {
      models: {
        generateContent: jest.fn(),
        generateContentStream: jest.fn(),
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

    (service as any).groq.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: '"Hello from AI"' } }],
      usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 },
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
      model: 'llama-3.3-70b-versatile',
      promptTokens: 120,
      completionTokens: 30,
      totalTokens: 150,
      estimatedCostUsd: '0.000000',
    });
    expect(result).toEqual({
      success: true,
      reply: 'Hello from AI',
      model: 'llama-3.3-70b-versatile',
      usage: {
        promptTokens: 120,
        completionTokens: 30,
        totalTokens: 150,
      },
      estimatedCostUsd: 0,
    });
  });

  it('should use Gemini fallback when Groq request fails', async () => {
    const dto = { email: 'user@example.com', message: 'Hi bot' };
    chatRepo.find.mockResolvedValue([]);

    (service as any).groq.chat.completions.create.mockRejectedValue(
      new Error('Groq failed'),
    );
    (service as any).gemini.models.generateContent.mockResolvedValue({
      text: 'Gemini fallback reply',
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 20,
        totalTokenCount: 30,
      },
    });

    const result = await service.generateResponse(dto);

    expect((service as any).groq.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'llama-3.3-70b-versatile' }),
    );
    expect((service as any).gemini.models.generateContent).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-1.5-flash' }),
    );
    expect(result).toEqual({
      success: true,
      reply: 'Gemini fallback reply',
      model: 'gemini-1.5-flash',
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      },
      estimatedCostUsd: 0,
    });
  });

  it('should throw when AI returns empty content', async () => {
    const dto = { email: 'user@example.com', message: 'Hi bot' };
    chatRepo.find.mockResolvedValue([]);

    (service as any).groq.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: '' } }],
    });

    await expect(service.generateResponse(dto)).rejects.toThrow(
      'AI failed to respond',
    );
  });

  it('should throw when AI request fails', async () => {
    const dto = { email: 'user@example.com', message: 'Hi bot' };
    chatRepo.find.mockResolvedValue([]);

    (service as any).groq.chat.completions.create.mockRejectedValue(
      new Error('Provider down'),
    );
    (service as any).gemini.models.generateContent.mockRejectedValue(
      new Error('Fallback down'),
    );

    await expect(service.generateResponse(dto)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('should stream tokens and persist final assistant reply', async () => {
    const dto = { email: 'user@example.com', message: 'Stream test' };
    chatRepo.find.mockResolvedValue([]);

    const asyncChatStream = {
      async *[Symbol.asyncIterator]() {
        yield { choices: [{ delta: { content: 'Hello' } }] };
        yield { choices: [{ delta: { content: ' world' } }] };
      },
    };

    (service as any).groq.chat.completions.create.mockResolvedValue(asyncChatStream);

    const tokens: string[] = [];
    const result = await service.generateStreamingResponse(dto, (t) => tokens.push(t));

    expect(tokens).toEqual(['Hello', ' world']);
    expect(chatRepo.save).toHaveBeenNthCalledWith(1, {
      email: dto.email,
      role: 'user',
      content: dto.message,
    });
    expect(chatRepo.save).toHaveBeenNthCalledWith(2, {
      email: dto.email,
      role: 'assistant',
      content: 'Hello world',
      model: 'llama-3.3-70b-versatile',
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: '0.000000',
    });
    expect(result).toEqual({
      success: true,
      reply: 'Hello world',
      model: 'llama-3.3-70b-versatile',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      estimatedCostUsd: 0,
    });
  });

  it('should stream from Gemini fallback when Groq stream fails', async () => {
    const dto = { email: 'user@example.com', message: 'Stream fallback test' };
    chatRepo.find.mockResolvedValue([]);

    const asyncGeminiStream = {
      async *[Symbol.asyncIterator]() {
        yield { text: 'Gemini' };
        yield { text: ' stream' };
      },
    };

    (service as any).groq.chat.completions.create.mockRejectedValue(
      new Error('Groq stream failed'),
    );
    (service as any).gemini.models.generateContentStream.mockResolvedValue(
      asyncGeminiStream,
    );

    const tokens: string[] = [];
    const result = await service.generateStreamingResponse(dto, (t) => tokens.push(t));

    expect(tokens).toEqual(['Gemini', ' stream']);
    expect((service as any).gemini.models.generateContentStream).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-1.5-flash' }),
    );
    expect(result).toEqual({
      success: true,
      reply: 'Gemini stream',
      model: 'gemini-1.5-flash',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      estimatedCostUsd: 0,
    });
  });
});
