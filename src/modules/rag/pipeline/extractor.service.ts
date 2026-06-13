import { Injectable, BadRequestException } from '@nestjs/common';
import * as mammoth from 'mammoth';

/**
 * Represents one page (real or pseudo) of an extracted document.
 * page numbers are 1-indexed. DOCX files get pseudo-pages based on word count.
 */
export interface ExtractedPage {
  pageNumber: number;
  text: string;
}

@Injectable()
export class ExtractorService {
  /**
   * Extracts text from an uploaded PDF or DOCX file as structured pages.
   * Each entry in the returned array represents one page of the document.
   */
  async extract(file: Express.Multer.File): Promise<ExtractedPage[]> {
    if (!file || !file.buffer) {
      throw new BadRequestException('No file provided for extraction.');
    }

    // Handle PDF — extract real pages with real page numbers
    if (file.mimetype === 'application/pdf') {
      try {
        const { PDFParse } = require('pdf-parse');
        const parser = new PDFParse({ data: file.buffer });
        const doc = await parser.load();

        const pages: ExtractedPage[] = [];
        for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
          const page = await doc.getPage(pageNum);
          const pageText = await parser.getPageText(page, {}, doc.numPages);
          page.cleanup();

          const trimmed = pageText.trim();
          if (trimmed) {
            pages.push({ pageNumber: pageNum, text: trimmed });
          }
        }

        return pages;
      } catch (error) {
        console.error('PDF Parse Error Details:', error);
        throw new BadRequestException(`Failed to parse PDF file: ${error.message}`);
      }
    }

    // Handle DOCX / MS Word — no native pages, so split by word count
    if (
      file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.mimetype === 'application/msword'
    ) {
      try {
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        return this.splitIntoPseudoPages(result.value);
      } catch (error) {
        console.error('DOCX Parse Error Details:', error);
        throw new BadRequestException(`Failed to parse DOCX file: ${error.message}`);
      }
    }

    throw new BadRequestException(
      `Unsupported file type: ${file.mimetype}. Please upload a PDF or DOCX file.`,
    );
  }

  /**
   * Splits a flat DOCX text into pseudo-pages of ~300 words each.
   * This gives DOCX files approximate page numbers for citations.
   */
  private splitIntoPseudoPages(text: string, wordsPerPage = 300): ExtractedPage[] {
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const pages: ExtractedPage[] = [];
    let pageNum = 1;

    for (let i = 0; i < words.length; i += wordsPerPage) {
      const pageText = words.slice(i, i + wordsPerPage).join(' ').trim();
      if (pageText) {
        pages.push({ pageNumber: pageNum++, text: pageText });
      }
    }

    return pages;
  }
}