import { Test, TestingModule } from '@nestjs/testing';
import { ChatbotController } from './chatbot.controller';
import { ChatbotService } from './chatbot.service';
import { ChatRequestDto } from './dto/chat-request.dto';

describe('ChatbotController', () => {
  let controller: ChatbotController;
  let chatbotService: {
    generateResponse: jest.Mock;
    generateStreamingResponse: jest.Mock;
  };

  beforeEach(async () => {
    // Mock service: we control what generateResponse returns in tests
    chatbotService = {
      generateResponse: jest.fn(),
      generateStreamingResponse: jest.fn(),
    };

    // Build mini Nest module for this controller test
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatbotController],
      providers: [
        {
          provide: ChatbotService,
          useValue: chatbotService,
        },
      ],
    }).compile();

    controller = module.get<ChatbotController>(ChatbotController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should pass DTO to service and return service response', async () => {
    const dto: ChatRequestDto = {
      email: 'user@example.com',
      message: 'Hi bot',
    };

    const mockResponse = { success: true, reply: 'Hello there' };
    chatbotService.generateResponse.mockResolvedValue(mockResponse);

    // Call controller method directly
    const result = await controller.askBot(dto);

    // Verify controller delegates work to service correctly
    expect(chatbotService.generateResponse).toHaveBeenCalledWith(
      dto,
      expect.any(String),
    );
    expect(result).toEqual(mockResponse);
  });

  it('should stream tokens and final payload for stream endpoint', async () => {
    const dto: ChatRequestDto = {
      email: 'user@example.com',
      message: 'Hi bot',
    };

    const writes: string[] = [];
    const res = {
      setHeader: jest.fn(),
      write: jest.fn((chunk: string) => writes.push(chunk)),
      end: jest.fn(),
    } as any;

    chatbotService.generateStreamingResponse.mockImplementation(
      async (_dto, onToken) => {
        onToken('Hello');
        onToken(' world');
        return {
          success: true,
          reply: 'Hello world',
          model: 'openrouter/free',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          estimatedCostUsd: 0,
        };
      },
    );

    await controller.askBotStream(dto, res);

    expect(chatbotService.generateStreamingResponse).toHaveBeenCalledWith(
      dto,
      expect.any(Function),
      expect.any(String),
    );
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(res.end).toHaveBeenCalled();
    expect(writes.some((w) => w.includes('"token":"Hello"'))).toBe(true);
    expect(writes.some((w) => w.includes('event: done'))).toBe(true);
  });
});
