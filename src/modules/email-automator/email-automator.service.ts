// email-automator.service.ts
import { Injectable } from '@nestjs/common';
import { EmailProcessorService } from './chains/email-processor';

@Injectable()
export class EmailAutomatorService {
  constructor(private readonly emailProcessor: EmailProcessorService) {}
  
  async classifyAndRespond(emailText: string) {
    return this.emailProcessor.processEmail(emailText);
  }
}