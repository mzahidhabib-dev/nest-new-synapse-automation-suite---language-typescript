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
  Headers,
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
  async getAllDocuments(@Headers('x-client-id') clientId: string) {
    if (!clientId) throw new BadRequestException('x-client-id header is required');
    return this.ragService.getAllDocuments(clientId);
  }

  @Delete('documents/:id')
  async deleteDocument(@Headers('x-client-id') clientId: string, @Param('id') id: string) {
    if (!clientId) throw new BadRequestException('x-client-id header is required');
    return this.ragService.deleteDocument(id, clientId);
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
  async uploadDocument(@Headers('x-client-id') clientId: string, @UploadedFile() file: Express.Multer.File) {
    if (!clientId) throw new BadRequestException('x-client-id header is required');
    if (!file) {
      throw new BadRequestException('No file provided in the request.');
    }
    return this.ragService.processDocument(file, clientId);
  }

  @Post('chat')
  async chat(@Headers('x-client-id') clientId: string, @Body() queryDto: QueryRagDto) {
    if (!clientId) throw new BadRequestException('x-client-id header is required');
    const sessionId = queryDto.sessionId || '00000000-0000-0000-0000-000000000000'; 
    return this.chatService.chat(queryDto.query, sessionId, clientId);
  }

  @Get('chat/:sessionId')
  getChatHistory(@Headers('x-client-id') clientId: string, @Param('sessionId') sessionId: string) {
    if (!clientId) throw new BadRequestException('x-client-id header is required');
    return this.chatService.getChatHistory(sessionId, clientId);
  }
}
