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
  UseGuards,
  Sse,
  Request,
  NotFoundException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { RagService } from './rag.service';
import { RagChatService } from './chat/rag-chat.service';
import { QueryRagDto } from './dto/query-rag.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
 
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
];

@Controller('rag')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RagController {
  constructor(
    private readonly ragService: RagService,
    private readonly chatService: RagChatService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('admin/stats')
  @Roles('admin')
  async getAdminStats() {
    return this.ragService.getAdminStats();
  }

  @Get('client/stats')
  async getClientStats(@Request() req) {
    return this.ragService.getClientStats(req.user.tenantId);
  }

  @Get('documents')
  async getAllDocuments(@Request() req) {
    return this.ragService.getAllDocuments(req.user.tenantId);
  }

  @Delete('documents/:id')
  async deleteDocument(@Request() req, @Param('id') id: string) {
    return this.ragService.deleteDocument(id, req.user.tenantId);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException(`Unsupported file type: ${file.mimetype}. Only PDF and DOCX are allowed.`), false);
        }
      },
    }),
  )
  async uploadDocument(@Request() req, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file provided in the request.');
    }
    return this.ragService.processDocument(file, req.user.tenantId);
  }

  @Post('chat')
  @Sse()
  chat(@Request() req, @Body() queryDto: QueryRagDto): Observable<any> {
    const sessionId = queryDto.sessionId || '00000000-0000-0000-0000-000000000000'; 
    return this.chatService.chatStream(queryDto.query, sessionId, req.user.tenantId, req.user.userId);
  }

  @Get('chat/:sessionId')
  getChatHistory(@Request() req, @Param('sessionId') sessionId: string) {
    return this.chatService.getChatHistory(sessionId, req.user.tenantId);
  }

  // ─── Session Management ───────────────────────────────────────────────────

  @Post('sessions')
  async createSession(@Request() req) {
    const { userId, tenantId } = req.user;
    const session = await this.prisma.chatSession.create({
      data: { tenantId, userId, title: 'New Chat' },
    });
    return { id: session.id, title: session.title };
  }

  @Get('sessions')
  async listSessions(@Request() req) {
    const { userId, tenantId } = req.user;
    return this.prisma.chatSession.findMany({
      where: { tenantId, userId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });
  }

  @Delete('sessions/:id')
  async deleteSession(@Request() req, @Param('id') id: string) {
    const session = await this.prisma.chatSession.findUnique({ where: { id } });
    if (!session || session.userId !== req.user.userId) {
      throw new NotFoundException('Session not found');
    }
    await this.prisma.chatSession.delete({ where: { id } });
    return { deleted: true };
  }
}
