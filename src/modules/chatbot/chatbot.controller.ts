import { Body, Controller, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
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

  @Post('ask/stream')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async askBotStream(
    @Body() chatRequestDto: ChatRequestDto,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      const result = await this.chatbotService.generateStreamingResponse(
        chatRequestDto,
        (token: string) => {
          res.write(`data: ${JSON.stringify({ token })}\n\n`);
        },
      );

      res.write(`event: done\ndata: ${JSON.stringify(result)}\n\n`);
      res.end();
    } catch {
      res.write(
        `event: error\ndata: ${JSON.stringify({
          message: 'Streaming failed',
        })}\n\n`,
      );
      res.end();
    }
  }
}
