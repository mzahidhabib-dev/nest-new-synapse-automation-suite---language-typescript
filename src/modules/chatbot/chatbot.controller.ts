import { Controller, Post, Body } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ChatbotService } from './chatbot.service';
import { ChatRequestDto } from './dto/chat-request.dto';

@Controller('chatbot')
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  @Post('ask')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async askBot(@Body() chatRequestDto: ChatRequestDto) {
    return this.chatbotService.generateResponse(chatRequestDto);
  }
}
