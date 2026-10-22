import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import {
  validateFileBasics,
  validateAndExtractEpubMetadata,
  MAX_EPUB_FILE_SIZE,
} from '../validation';

describe('EPUB Validation & Metadata Extraction', () => {
  describe('validateFileBasics', () => {
    it('accepts a valid .epub file within size bounds', () => {
      const result = validateFileBasics('alice_in_wonderland.epub', 1024 * 1024, 'application/epub+zip');
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('rejects files larger than MAX_EPUB_FILE_SIZE (50 MB)', () => {
      const result = validateFileBasics('giant_book.epub', MAX_EPUB_FILE_SIZE + 100);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('exceeds the 50 MB limit');
    });

    it('rejects non-epub extensions', () => {
      const result = validateFileBasics('document.pdf', 5000, 'application/pdf');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid file extension');
    });

    it('rejects incompatible MIME types', () => {
      const result = validateFileBasics('hacked.epub', 5000, 'text/plain');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid MIME type');
    });
  });

  describe('validateAndExtractEpubMetadata', () => {
    it('successfully parses a well-formed EPUB archive with title, creator, and cover', async () => {
      const zip = new JSZip();
      zip.file('mimetype', 'application/epub+zip');
      zip.file(
        'META-INF/container.xml',
        `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
      );

      zip.file(
        'OEBPS/content.opf',
        `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>The Secret Garden</dc:title>
    <dc:creator>Frances Hodgson Burnett</dc:creator>
    <dc:description>A classic family novel about a hidden garden.</dc:description>
  </metadata>
  <manifest>
    <item id="cover-image" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>
    <item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
</package>`
      );

      // Dummy JPEG data for the cover
      zip.file('OEBPS/images/cover.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]));

      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      const result = await validateAndExtractEpubMetadata(buffer);

      expect(result.isValid).toBe(true);
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.title).toBe('The Secret Garden');
      expect(result.metadata?.author).toBe('Frances Hodgson Burnett');
      expect(result.metadata?.description).toBe('A classic family novel about a hidden garden.');
      expect(result.metadata?.coverHref).toBe('images/cover.jpg');
      expect(result.metadata?.coverDataUrl).toContain('data:image/jpeg;base64,');
      expect(result.metadata?.coverBuffer).toBeDefined();
    });

    it('rejects corrupt binary data that is not a ZIP archive', async () => {
      const corruptData = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
      const result = await validateAndExtractEpubMetadata(corruptData);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Failed to inspect EPUB archive');
    });

    it('rejects EPUB missing container.xml', async () => {
      const zip = new JSZip();
      zip.file('mimetype', 'application/epub+zip');
      zip.file('dummy.txt', 'hello');

      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      const result = await validateAndExtractEpubMetadata(buffer);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('missing "META-INF/container.xml"');
    });

    it('handles EPUB with missing or empty metadata gracefully', async () => {
      const zip = new JSZip();
      zip.file('mimetype', 'application/epub+zip');
      zip.file(
        'META-INF/container.xml',
        `<container><rootfiles><rootfile full-path="content.opf"/></rootfiles></container>`
      );
      zip.file('content.opf', `<package><metadata></metadata></package>`);

      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      const result = await validateAndExtractEpubMetadata(buffer);

      expect(result.isValid).toBe(true);
      expect(result.metadata?.title).toBe('Untitled Book');
      expect(result.metadata?.author).toBeUndefined();
    });
  });
});
