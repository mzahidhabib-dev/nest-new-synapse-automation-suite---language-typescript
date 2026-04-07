import { Controller, Post, Body } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';
import { ChatRequestDto } from './dto/chat-request.dto';

@Controller('chatbot')
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  @Post('ask')
  async askBot(@Body() chatRequestDto: ChatRequestDto) {
    return this.chatbotService.generateResponse(chatRequestDto);
  }
}