// test/lead-pipeline.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { LeadPipelineController } from '../src/modules/lead-pipeline/lead-pipeline.controller';
import { LeadAnalyzerChainService } from '../src/modules/lead-pipeline/chains/lead-analyzer-chain.service';

describe('Lead Pipeline Webhook (e2e)', () => {
  let app: INestApplication;

  // We create a mock service so we don't actually hit the database or LLMs during testing
  const mockLeadAnalyzerService = {
    processLeadPipeline: jest.fn().mockResolvedValue({
      action: 'approved_auto_reply',
      processingTimeMs: 120,
      classification: { category: 'hot_lead' }
    }),
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [LeadPipelineController],
      providers: [
        {
          provide: LeadAnalyzerChainService,
          useValue: mockLeadAnalyzerService,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    
    // We must apply the exact same ValidationPipe used in main.ts to test our DTOs properly
    app.useGlobalPipes(new ValidationPipe({ 
      whitelist: true, 
      forbidNonWhitelisted: true 
    }));
    
    await app.init();
  });

  it('should reject requests with missing email text (400 Bad Request)', () => {
    return request(app.getHttpServer())
      .post('/lead/process')
      .send({ 
        // Missing emailText entirely
        source: 'n8n_test' 
      })
      .expect(400);
  });

  it('should reject requests with email text that is too short (400 Bad Request)', () => {
    return request(app.getHttpServer())
      .post('/lead/process')
      .send({ 
        emailText: 'hi' // Under the 10-character limit set in LeadRequestDto
      })
      .expect(400);
  });

  it('should accept valid payloads and return simulated processing JSON (200 OK)', () => {
    return request(app.getHttpServer())
      .post('/lead/process')
      .send({ 
        emailText: 'Hello, we are looking to build a new backend automation system next month. We have a budget of $5k.' 
      })
      .expect(200)
      .expect((res) => {
        expect(res.body.action).toEqual('approved_auto_reply');
        expect(res.body.classification.category).toEqual('hot_lead');
      });
  });

  afterAll(async () => {
    await app.close();
  });
});