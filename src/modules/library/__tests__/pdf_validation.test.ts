import { describe, it, expect } from 'vitest';
import {
  validateFileBasics,
  validateAndExtractPdfMetadata,
  validateAndExtractMetadata,
} from '../validation';

describe('PDF Ingestion & Multi-Format Validation', () => {
  describe('validateFileBasics', () => {
    it('accepts valid PDF files within 50 MB limit', () => {
      const res = validateFileBasics('storybook.pdf', 5 * 1024 * 1024, 'application/pdf');
      expect(res.isValid).toBe(true);
      expect(res.format).toBe('pdf');
      expect(res.error).toBeUndefined();
    });

    it('accepts valid EPUB files within 50 MB limit', () => {
      const res = validateFileBasics('novel.epub', 2 * 1024 * 1024, 'application/epub+zip');
      expect(res.isValid).toBe(true);
      expect(res.format).toBe('epub');
    });

    it('rejects unsupported extensions', () => {
      const res = validateFileBasics('image.png', 1024);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('Only .epub and .pdf files are supported');
    });

    it('rejects files exceeding 50 MB', () => {
      const res = validateFileBasics('huge.pdf', 55 * 1024 * 1024);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('exceeds the 50 MB limit');
    });
  });

  describe('validateAndExtractPdfMetadata', () => {
    it('successfully extracts title, author, and page count from standard PDF binary', async () => {
      const samplePdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 42 >>
endobj
3 0 obj
<< /Type /Page >>
endobj
4 0 obj
<< /Title (The Velveteen Rabbit) /Author (Margery Williams) >>
endobj
trailer
<< /Root 1 0 R /Info 4 0 R >>
%%EOF`;

      const encoder = new TextEncoder();
      const buffer = encoder.encode(samplePdfContent).buffer;

      const res = await validateAndExtractPdfMetadata(buffer, 'the_velveteen_rabbit.pdf');
      expect(res.isValid).toBe(true);
      expect(res.metadata).toBeDefined();
      expect(res.metadata?.title).toBe('The Velveteen Rabbit');
      expect(res.metadata?.author).toBe('Margery Williams');
      expect(res.metadata?.format).toBe('pdf');
      expect(res.metadata?.pageCount).toBe(42);
    });

    it('falls back to sanitized filename when metadata title is absent', async () => {
      const samplePdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Count 5 >>
endobj
%%EOF`;

      const buffer = new TextEncoder().encode(samplePdf).buffer;
      const res = await validateAndExtractPdfMetadata(buffer, 'my_bedtime_stories_vol1.pdf');

      expect(res.isValid).toBe(true);
      expect(res.metadata?.title).toBe('My Bedtime Stories Vol1');
      expect(res.metadata?.author).toBeUndefined();
      expect(res.metadata?.pageCount).toBe(5);
    });

    it('rejects corrupt binary data missing %PDF- header', async () => {
      const corruptData = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
      const res = await validateAndExtractPdfMetadata(corruptData);

      expect(res.isValid).toBe(false);
      expect(res.error).toContain('missing "%PDF-" header signature');
    });
  });

  describe('validateAndExtractMetadata (Unified Router)', () => {
    it('routes PDF files to PDF extraction pipeline', async () => {
      const pdfData = `%PDF-1.5
<< /Type /Pages /Count 10 >>
%%EOF`;
      const buffer = new TextEncoder().encode(pdfData).buffer;

      const res = await validateAndExtractMetadata('classic_tales.pdf', buffer, 'application/pdf');
      expect(res.isValid).toBe(true);
      expect(res.metadata?.format).toBe('pdf');
      expect(res.metadata?.title).toBe('Classic Tales');
    });

    it('rejects unsupported extensions in unified router', async () => {
      const dummy = new Uint8Array([1, 2, 3]);
      const res = await validateAndExtractMetadata('script.js', dummy);

      expect(res.isValid).toBe(false);
      expect(res.error).toContain('Unsupported document format');
    });
  });
});
