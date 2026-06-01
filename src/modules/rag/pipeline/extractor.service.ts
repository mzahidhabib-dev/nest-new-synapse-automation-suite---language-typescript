import { Injectable, BadRequestException } from '@nestjs/common';
import * as mammoth from 'mammoth';

@Injectable()
export class ExtractorService {
  /**
   * Extracts raw text from an uploaded PDF or DOCX file.
   */
  async extract(file: Express.Multer.File): Promise<string> {
    if (!file || !file.buffer) {
      throw new BadRequestException('No file provided for extraction.');
    }

    // Handle PDF
    if (file.mimetype === 'application/pdf') {
      try {
        // pdf-parse v2: pass buffer via `data` option, then call getText()
        const { PDFParse } = require('pdf-parse');
        const parser = new PDFParse({ data: file.buffer });
        const result = await parser.getText();
        return result.text;
      } catch (error) {
        console.error('PDF Parse Error Details:', error);
        throw new BadRequestException(`Failed to parse PDF file: ${error.message}`);
      }
    }

    // Handle DOCX / MS Word
    if (
      file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.mimetype === 'application/msword'
    ) {
      try {
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        return result.value;
      } catch (error) {
        console.error('DOCX Parse Error Details:', error);
        throw new BadRequestException(`Failed to parse DOCX file: ${error.message}`);
      }
    }

    // Reject anything else
    throw new BadRequestException(
      `Unsupported file type: ${file.mimetype}. Please upload a PDF or DOCX file.`
    );
  }
}