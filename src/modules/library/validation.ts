import JSZip from 'jszip';

export const MAX_EPUB_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export interface EpubMetadata {
  title: string;
  author?: string;
  description?: string;
  coverHref?: string;
  coverDataUrl?: string;
  coverBuffer?: Uint8Array;
  coverMediaType?: string;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  metadata?: EpubMetadata;
}

/**
 * Validates a file's size and extension prior to deep archive analysis.
 */
export function validateFileBasics(
  fileName: string,
  fileSize: number,
  mimeType?: string
): { isValid: boolean; error?: string } {
  if (fileSize > MAX_EPUB_FILE_SIZE) {
    return {
      isValid: false,
      error: `File size exceeds the 50 MB limit (current: ${(fileSize / (1024 * 1024)).toFixed(2)} MB).`,
    };
  }

  if (!fileName.toLowerCase().endsWith('.epub')) {
    return {
      isValid: false,
      error: 'Invalid file extension. Only .epub files are supported.',
    };
  }

  if (mimeType && mimeType !== 'application/epub+zip' && mimeType !== 'application/zip' && mimeType !== 'application/octet-stream') {
    return {
      isValid: false,
      error: `Invalid MIME type (${mimeType}). Expected application/epub+zip.`,
    };
  }

  return { isValid: true };
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
      // Decode URI components in case href is URL-encoded
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

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
