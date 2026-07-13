import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LlmConfigService {
  constructor(private configService: ConfigService) { }

  // get groqApiKey(): string {
  //   return this.configService.get<string>('GROQ_API_KEY');
  // }
  get groqApiKey(): string {
    const key = this.configService.get<string>('GROQ_API_KEY');
    if (!key) throw new Error('Missing GROQ_API_KEY');
    return key;
  }

  get geminiApiKey(): string {
    const key = this.configService.get<string>('GEMINI_API_KEY');
    if (!key) throw new Error('Missing GEMINI_API_KEY');
    return key;
  }

  get groqModel(): string {
    return this.configService.get<string>('GROQ_MODEL', 'llama3-70b-8192');
  }

  get geminiModel(): string {
    return this.configService.get<string>('GEMINI_MODEL', 'gemini-pro');
  }

  get temperature(): number {
    return this.configService.get<number>('LLM_TEMPERATURE', 0.1);
  }

  get maxTokens(): number {
    return this.configService.get<number>('MAX_TOKENS', 1000);
  }
}