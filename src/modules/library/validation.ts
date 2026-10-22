import JSZip from 'jszip';

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
export const MAX_EPUB_FILE_SIZE = MAX_FILE_SIZE; // Alias for backward compatibility

export type SupportedFormat = 'epub' | 'pdf';

export interface BookMetadata {
  title: string;
  author?: string;
  description?: string;
  format: SupportedFormat;
  pageCount?: number;
  coverHref?: string;
  coverDataUrl?: string;
  coverBuffer?: Uint8Array;
  coverMediaType?: string;
}

export type EpubMetadata = BookMetadata; // Backward compatibility alias

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  metadata?: BookMetadata;
}

/**
 * Validates file size and format extension (.epub, .pdf).
 */
export function validateFileBasics(
  fileName: string,
  fileSize: number,
  mimeType?: string
): { isValid: boolean; format?: SupportedFormat; error?: string } {
  if (fileSize > MAX_FILE_SIZE) {
    return {
      isValid: false,
      error: `File size exceeds the 50 MB limit (current: ${(fileSize / (1024 * 1024)).toFixed(2)} MB).`,
    };
  }

  const lowerName = fileName.toLowerCase();
  let format: SupportedFormat | null = null;
  if (lowerName.endsWith('.epub')) {
    format = 'epub';
  } else if (lowerName.endsWith('.pdf')) {
    format = 'pdf';
  }

  if (!format) {
    return {
      isValid: false,
      error: 'Invalid file extension. Only .epub and .pdf files are supported.',
    };
  }

  if (mimeType) {
    const validMimes = [
      'application/epub+zip',
      'application/pdf',
      'application/x-pdf',
      'application/zip',
      'application/octet-stream',
    ];
    if (!validMimes.includes(mimeType)) {
      return {
        isValid: false,
        error: `Invalid MIME type (${mimeType}). Expected EPUB or PDF.`,
      };
    }
  }

  return { isValid: true, format };
}

/**
 * Inspects a PDF buffer, verifies the %PDF- header, extracts metadata,
 * calculates page count, and creates a first-page cover thumbnail if canvas is available.
 */
export async function validateAndExtractPdfMetadata(
  data: ArrayBuffer | Uint8Array | Buffer,
  fileName?: string
): Promise<ValidationResult> {
  try {
    const uint8 = data instanceof Uint8Array ? data : new Uint8Array(data);

    // 1. Verify %PDF- magic signature in the first 1024 bytes
    const headerSlice = uint8.slice(0, Math.min(uint8.length, 1024));
    const headerStr = new TextDecoder('latin1').decode(headerSlice);

    if (!headerStr.includes('%PDF-')) {
      return {
        isValid: false,
        error: 'Invalid or corrupt PDF: missing "%PDF-" header signature.',
      };
    }

    // 2. Extract metadata from PDF trailer/catalog using binary text search
    // We inspect the head (first 64KB) and tail (last 64KB) where trailer & Info dicts live
    const headText = new TextDecoder('latin1').decode(uint8.slice(0, Math.min(uint8.length, 65536)));
    const tailOffset = Math.max(0, uint8.length - 65536);
    const tailText = new TextDecoder('latin1').decode(uint8.slice(tailOffset));
    const combinedText = headText + '\n' + tailText;

    let title: string | undefined;
    let author: string | undefined;

    // Regex for PDF string literals: /Title (string) or /Title <hex>
    const titleMatch = combinedText.match(/\/Title\s*(?:\(([^)]+)\)|<([0-9a-fA-F]+)>)/i);
    if (titleMatch) {
      if (titleMatch[1]) {
        title = sanitizePdfString(titleMatch[1]);
      } else if (titleMatch[2]) {
        title = decodeHexPdfString(titleMatch[2]);
      }
    }

    const authorMatch = combinedText.match(/\/Author\s*(?:\(([^)]+)\)|<([0-9a-fA-F]+)>)/i);
    if (authorMatch) {
      if (authorMatch[1]) {
        author = sanitizePdfString(authorMatch[1]);
      } else if (authorMatch[2]) {
        author = decodeHexPdfString(authorMatch[2]);
      }
    }

    // Fallback title to sanitized file name
    if (!title || !title.trim()) {
      title = sanitizeFilenameTitle(fileName || 'Untitled Document');
    }

    // 3. Page count calculation (from /Type /Pages /Count N or /Type /Page occurrences)
    let pageCount: number | undefined;
    const countMatch = combinedText.match(/\/Type\s*\/Pages[^>]*\/Count\s+(\d+)/i) ||
                       combinedText.match(/\/Count\s+(\d+)[^>]*\/Type\s*\/Pages/i);
    if (countMatch && countMatch[1]) {
      pageCount = parseInt(countMatch[1], 10);
    } else {
      // Fallback count occurrences of "/Type /Page"
      const fullText = new TextDecoder('latin1').decode(uint8);
      const pageMatches = fullText.match(/\/Type\s*\/Page\b/g);
      pageCount = pageMatches ? pageMatches.length : 1;
    }

    // 4. Client-side canvas thumbnail generation (if in browser environment)
    let coverDataUrl: string | undefined;
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      try {
        const pdfjs = await import('pdfjs-dist');
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        }
        const loadingTask = pdfjs.getDocument({ data: uint8 });
        const pdfDoc = await loadingTask.promise;
        if (pdfDoc.numPages > 0) {
          pageCount = pdfDoc.numPages;
          const page = await pdfDoc.getPage(1);
          const viewport = page.getViewport({ scale: 0.5 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            // @ts-expect-error pdfjs canvas rendering parameters
            await page.render({ canvasContext: ctx, viewport }).promise;
            coverDataUrl = canvas.toDataURL('image/jpeg', 0.85);
          }
        }
      } catch {
        // Thumbnail generation is optional; continue without error
      }
    }

    return {
      isValid: true,
      metadata: {
        title,
        author: author || undefined,
        format: 'pdf',
        pageCount: pageCount || 1,
        coverDataUrl,
      },
    };
  } catch (err) {
    return {
      isValid: false,
      error: `Failed to inspect PDF document: ${err instanceof Error ? err.message : 'Corrupt PDF structure'}`,
    };
  }
}

/**
 * Inspects an EPUB buffer, verifies its ZIP container structure,
 * and extracts title, author, description, and cover image metadata.
 */
export async function validateAndExtractEpubMetadata(
  data: ArrayBuffer | Uint8Array | Buffer
): Promise<ValidationResult> {
  try {
    const zip = await JSZip.loadAsync(data);

    // 1. Check for mimetype file
    const mimetypeFile = zip.file('mimetype');
    if (mimetypeFile) {
      const mimetype = (await mimetypeFile.async('text')).trim();
      if (mimetype !== 'application/epub+zip') {
        return {
          isValid: false,
          error: `Corrupt EPUB: mimetype content is "${mimetype}", expected "application/epub+zip".`,
        };
      }
    }

    // 2. Locate container.xml
    const containerFile = zip.file('META-INF/container.xml');
    if (!containerFile) {
      return {
        isValid: false,
        error: 'Invalid EPUB structure: missing "META-INF/container.xml".',
      };
    }

    const containerXml = await containerFile.async('text');
    const rootfileMatch = containerXml.match(/full-path=["']([^"']+)["']/i);
    if (!rootfileMatch || !rootfileMatch[1]) {
      return {
        isValid: false,
        error: 'Invalid EPUB structure: rootfile path not declared in container.xml.',
      };
    }

    const opfPath = rootfileMatch[1];
    const opfFile = zip.file(opfPath);
    if (!opfFile) {
      return {
        isValid: false,
        error: `Invalid EPUB structure: declared OPF file "${opfPath}" not found in archive.`,
      };
    }

    const opfContent = await opfFile.async('text');

    // 3. Extract Metadata fields via regex
    const titleMatch = opfContent.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i);
    const title = titleMatch ? cleanXmlText(titleMatch[1]) : 'Untitled Book';

    const authorMatch = opfContent.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i);
    const author = authorMatch ? cleanXmlText(authorMatch[1]) : undefined;

    const descMatch = opfContent.match(/<dc:description[^>]*>([\s\S]*?)<\/dc:description>/i);
    const description = descMatch ? cleanXmlText(descMatch[1]) : undefined;

    // 4. Resolve OPF base directory to handle relative cover paths
    const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

    // 5. Detect Cover Image
    let coverHref: string | undefined;
    let coverMediaType = 'image/jpeg';

    // EPUB 3 style: item with properties="cover-image"
    const epub3Cover = opfContent.match(/<item[^>]+properties=["'][^"']*cover-image[^"']*["'][^>]*>/i);
    if (epub3Cover) {
      const href = epub3Cover[0].match(/href=["']([^"']+)["']/i);
      const media = epub3Cover[0].match(/media-type=["']([^"']+)["']/i);
      if (href) coverHref = href[1];
      if (media) coverMediaType = media[1];
    }

    // EPUB 2 style: meta name="cover" content="item_id"
    if (!coverHref) {
      const metaCoverMatch = opfContent.match(/<meta[^>]+name=["']cover["'][^>]+content=["']([^"']+)["']/i) ||
                             opfContent.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']cover["']/i);
      if (metaCoverMatch && metaCoverMatch[1]) {
        const coverId = metaCoverMatch[1];
        const itemRegex = new RegExp(`<item[^>]+id=["']${escapeRegExp(coverId)}["'][^>]*>`, 'i');
        const itemMatch = opfContent.match(itemRegex);
        if (itemMatch) {
          const href = itemMatch[0].match(/href=["']([^"']+)["']/i);
          const media = itemMatch[0].match(/media-type=["']([^"']+)["']/i);
          if (href) coverHref = href[1];
          if (media) coverMediaType = media[1];
        }
      }
    }

    // Fallback: any item with id="cover" or href containing "cover"
    if (!coverHref) {
      const fallbackItem = opfContent.match(/<item[^>]+href=["']([^"']*cover\.(?:jpg|jpeg|png|webp))["'][^>]*>/i);
      if (fallbackItem && fallbackItem[1]) {
        coverHref = fallbackItem[1];
      }
    }

    let coverDataUrl: string | undefined;
    let coverBuffer: Uint8Array | undefined;

    if (coverHref) {
      const cleanHref = decodeURIComponent(coverHref);
      const fullCoverPath = opfDir + cleanHref;
      const coverZipFile = zip.file(fullCoverPath) || zip.file(cleanHref);

      if (coverZipFile) {
        const base64 = await coverZipFile.async('base64');
        coverBuffer = await coverZipFile.async('uint8array');
        coverDataUrl = `data:${coverMediaType};base64,${base64}`;
      }
    }

    return {
      isValid: true,
      metadata: {
        title,
        author,
        description,
        format: 'epub',
        coverHref,
        coverDataUrl,
        coverBuffer,
        coverMediaType,
      },
    };
  } catch (err) {
    return {
      isValid: false,
      error: `Failed to inspect EPUB archive: ${err instanceof Error ? err.message : 'Corrupt ZIP structure'}`,
    };
  }
}

/**
 * Unified metadata extraction router:
 * Automatically routes to PDF or EPUB extractor based on file extension / MIME type.
 */
export async function validateAndExtractMetadata(
  fileName: string,
  buffer: ArrayBuffer | Uint8Array | Buffer,
  mimeType?: string
): Promise<ValidationResult> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf') || mimeType === 'application/pdf') {
    return validateAndExtractPdfMetadata(buffer, fileName);
  }
  if (lower.endsWith('.epub') || mimeType === 'application/epub+zip') {
    return validateAndExtractEpubMetadata(buffer);
  }

  return {
    isValid: false,
    error: 'Unsupported document format. Only .epub and .pdf are supported.',
  };
}

function cleanXmlText(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function sanitizePdfString(str: string): string {
  return str.replace(/\\([()\\])/g, '$1').trim();
}

function decodeHexPdfString(hex: string): string {
  try {
    let result = '';
    for (let i = 0; i < hex.length; i += 2) {
      result += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    }
    return result.trim();
  } catch {
    return hex;
  }
}

function sanitizeFilenameTitle(filename: string): string {
  const base = filename.replace(/\.[^/.]+$/, ''); // Remove extension
  return base
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
