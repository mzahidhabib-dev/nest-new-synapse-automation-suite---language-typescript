import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    // Create a small Nest test module (like a mini app only for this test file)
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    // Get controller instance from Nest's DI container
    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return welcome HTML content', () => {
      // Call the same method used by GET /
      const result = appController.getWelcome();

      // Basic checks to confirm we got a page-like response
      expect(typeof result).toBe('string');
      expect(result).toContain('<html');
      expect(result).toContain('Synapse Automation Suite');
    });
  });
});
