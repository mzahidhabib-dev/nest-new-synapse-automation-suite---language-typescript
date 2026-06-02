import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Get,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { RagService } from './rag.service';
import { RagChatService } from './chat/rag-chat.service';
import { QueryRagDto } from './dto/query-rag.dto';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
];

@Controller('rag')
export class RagController {
  constructor(
    private readonly ragService: RagService,
    private readonly chatService: RagChatService,
  ) {}

  @Get('documents')
  async getAllDocuments() {
    return this.ragService.getAllDocuments();
  }

  @Delete('documents/:id')
  async deleteDocument(@Param('id') id: string) {
    return this.ragService.deleteDocument(id);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException(`Unsupported file type: ${file.mimetype}. Only PDF and DOCX are allowed.`), false);
        }
      },
    }),
  )
  async uploadDocument(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file provided in the request.');
    }
    return this.ragService.processDocument(file);
  }

  @Post('chat')
  async chat(@Body() queryDto: QueryRagDto) {
    // Generate a simple session ID if one isn't provided or implemented fully in frontend yet
    const sessionId = 'default-session'; 
    return this.chatService.chat(queryDto.query, sessionId);
  }

  @Get('chat/:sessionId')
  getChatHistory(@Param('sessionId') sessionId: string) {
    return this.chatService.getChatHistory(sessionId);
  }
}
