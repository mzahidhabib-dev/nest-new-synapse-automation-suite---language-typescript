import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Module } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppController } from './../src/app.controller';
import { AppService } from './../src/app.service';

// e2e test module focused only on "/" route.
// We avoid importing AppModule here to prevent DB dependency in this test.
@Module({
  controllers: [AppController],
  providers: [AppService],
})
class RootE2eTestModule {}

describe('AppController (e2e)', () => {
  let app: INestApplication<App> | undefined;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [RootE2eTestModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app!.getHttpServer())
      .get('/')
      .expect(200)
      // Root endpoint now returns an HTML welcome page
      .expect('Content-Type', /html/)
      .expect((res) => {
        expect(res.text).toContain('<html');
        expect(res.text).toContain('Synapse Automation Suite');
      });
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });
});

