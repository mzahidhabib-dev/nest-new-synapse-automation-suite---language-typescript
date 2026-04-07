import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatbotController } from './chatbot.controller';
import { ChatbotService } from './chatbot.service';
import { ChatHistory } from './entities/chat-history.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ChatHistory])], // Register the history table
  controllers: [ChatbotController],
  providers: [ChatbotService],
})
export class ChatbotModule {}