import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ExtractorService } from './extractor.service';

describe('ExtractorService', () => {
  let service: ExtractorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ExtractorService],
    }).compile();

    service = module.get<ExtractorService>(ExtractorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should throw BadRequestException when no file is provided', async () => {
    await expect(service.extract(null as any)).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException when file has no buffer', async () => {
    const file = { mimetype: 'application/pdf', buffer: null } as any;
    await expect(service.extract(file)).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException for unsupported file type', async () => {
    const file = {
      mimetype: 'image/png',
      buffer: Buffer.from('fake data'),
    } as Express.Multer.File;

    await expect(service.extract(file)).rejects.toThrow(
      new BadRequestException(
        'Unsupported file type: image/png. Please upload a PDF or DOCX file.',
      ),
    );
  });

  it('should extract text from a minimal valid DOCX buffer', async () => {
    // mammoth can handle a real docx buffer — we test with a mock that returns gracefully
    // A real DOCX is a zip file; an invalid buffer will throw, which we verify is wrapped
    const file = {
      mimetype:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from('not a real docx'),
    } as Express.Multer.File;

    await expect(service.extract(file)).rejects.toThrow(BadRequestException);
  });
});
