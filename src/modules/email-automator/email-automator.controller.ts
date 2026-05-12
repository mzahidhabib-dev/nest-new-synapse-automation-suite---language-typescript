// email-automator.controller.ts
import { Controller, Post, Body } from '@nestjs/common';
import { EmailAutomatorService } from './email-automator.service';
import { EmailRequestDto } from './dto/email-request.dto';

@Controller('email-automator')
export class EmailAutomatorController {
  constructor(private readonly emailAutomatorService: EmailAutomatorService) {}
  
  @Post('process')
  async processEmail(@Body() body: EmailRequestDto) {
    return this.emailAutomatorService.classifyAndRespond(body.emailText);
  }
}