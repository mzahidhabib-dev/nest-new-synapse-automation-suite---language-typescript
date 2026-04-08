import { Body, Controller, Get, Post } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getWelcome() {
    return this.appService.getWelcome();
  }

  @Post('echo')
  echo(@Body() body: unknown) {
    return {
      success: true,
      received: body,
    };
  }
}
