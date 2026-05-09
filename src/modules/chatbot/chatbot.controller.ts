import { Body, Controller, Logger, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ChatbotService } from './chatbot.service';
import { ChatRequestDto } from './dto/chat-request.dto';

@Controller('chatbot')
export class ChatbotController {
  private readonly logger = new Logger(ChatbotController.name);

  constructor(private readonly chatbotService: ChatbotService) {}

  @Post('ask')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async askBot(@Body() chatRequestDto: ChatRequestDto) {
    const requestId = this.createRequestId();
    const startedAt = Date.now();

    this.logger.log(
      `[${requestId}] /ask received messageLength=${chatRequestDto.message?.length ?? 0}`,
    );

    try {
      const result = await this.chatbotService.generateResponse(chatRequestDto, requestId);
      this.logger.log(`[${requestId}] /ask completed totalMs=${Date.now() - startedAt}`);
      return result;
    } catch (error) {
      this.logger.error(
        `[${requestId}] /ask failed totalMs=${Date.now() - startedAt}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  @Post('ask/stream')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async askBotStream(
    @Body() chatRequestDto: ChatRequestDto,
    @Res() res: Response,
  ) {
    const requestId = this.createRequestId();
    const startedAt = Date.now();
    let tokenCount = 0;

    this.logger.log(
      `[${requestId}] /ask/stream received messageLength=${chatRequestDto.message?.length ?? 0}`,
    );

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      const result = await this.chatbotService.generateStreamingResponse(
        chatRequestDto,
        (token: string) => {
          tokenCount += 1;
          res.write(`data: ${JSON.stringify({ token })}\n\n`);
        },
        requestId,
      );

      res.write(`event: done\ndata: ${JSON.stringify(result)}\n\n`);
      res.end();
      this.logger.log(
        `[${requestId}] /ask/stream completed totalMs=${Date.now() - startedAt} tokenCount=${tokenCount}`,
      );
    } catch (error) {
      this.logger.error(
        `[${requestId}] /ask/stream failed totalMs=${Date.now() - startedAt} tokenCount=${tokenCount}`,
        error instanceof Error ? error.stack : undefined,
      );
      res.write(
        `event: error\ndata: ${JSON.stringify({
          message: 'Streaming failed',
        })}\n\n`,
      );
      res.end();
    }
  }

  private createRequestId(): string {
    return Math.random().toString(36).slice(2, 8);
  }
}
