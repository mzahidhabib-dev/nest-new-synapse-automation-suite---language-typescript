import { Test, TestingModule } from '@nestjs/testing';
import { ChatbotController } from './chatbot.controller';
import { ChatbotService } from './chatbot.service';
import { ChatRequestDto } from './dto/chat-request.dto';

describe('ChatbotController', () => {
  let controller: ChatbotController;
  let chatbotService: { generateResponse: jest.Mock };

  beforeEach(async () => {
    // Mock service: we control what generateResponse returns in tests
    chatbotService = {
      generateResponse: jest.fn(),
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
    expect(chatbotService.generateResponse).toHaveBeenCalledWith(dto);
    expect(result).toEqual(mockResponse);
  });
});
