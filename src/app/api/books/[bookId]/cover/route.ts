import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { verifyBookAccess } from '@/modules/reader/access';

export const dynamic = 'force-dynamic';

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
};

const NO_CACHE_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'Pragma': 'no-cache',
  ...SECURITY_HEADERS,
};

function getSuccessCacheHeaders(isPublic: boolean): Record<string, string> {
  return {
    'Cache-Control': isPublic
      ? 'private, max-age=3600, stale-while-revalidate=86400'
      : 'private, max-age=300, must-revalidate',
    'Vary': 'Cookie, Authorization',
    ...SECURITY_HEADERS,
  };
}

const TRUSTED_EXTERNAL_COVER_DOMAINS = [
  'covers.openlibrary.org',
  'openlibrary.org',
  'books.google.com',
  'images-na.ssl-images-amazon.com',
  'm.media-amazon.com',
];

function getProjectSupabaseHost(): string | null {
  try {
    const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return raw ? new URL(raw).hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

// Strictly raster formats only; SVG is explicitly rejected to eliminate same-origin script execution
const ALLOWED_IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|avif)$/i;

const EXTENSION_MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
};

/**
 * Authorized Book Cover Streamer & Proxy:
 * Securely serves cover images stored in the private 'books' storage bucket
 * or redirects to verified external cover URLs.
 * 
 * Security Guardrails:
 * 1. Requires valid authenticated session (401 for anonymous callers)
 * 2. Enforces book-level authorization via tenant membership, public status, or family library (403 if unauthorized)
 * 3. Enforces storage path integrity against path traversal, tenant mismatch, and document binary leak (400/403)
 * 4. Whitelists external HTTP(S) domains to eliminate Open Redirect / SSRF vectors (400 if untrusted)
 * 5. Uses private cache headers with 'Vary: Cookie, Authorization' on success, and 'no-store' on errors
 * 6. Hardened against XSS: Rejects SVG/XML, enforces raster formats, and applies X-Content-Type-Options: nosniff
 * 7. Access Revocation: Private covers use short 300s TTL with must-revalidate to ensure timely permission revocation
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> }
) {
  try {
    const { bookId } = await params;
    if (!bookId || typeof bookId !== 'string' || !bookId.trim() || bookId.length > 128) {
      return new NextResponse('Missing or invalid book identifier', {
        status: 400,
        headers: NO_CACHE_HEADERS,
      });
    }

    const cleanBookId = bookId.trim();

    // 1. Verify authentication
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new NextResponse('Unauthorized', {
        status: 401,
        headers: NO_CACHE_HEADERS,
      });
    }

    // 2. Enforce book-level authorization
    const access = await verifyBookAccess(user.id, user.email, cleanBookId);
    if (!access.authorized || !access.book) {
      return new NextResponse(access.error || 'Forbidden', {
        status: access.statusCode || 403,
        headers: NO_CACHE_HEADERS,
      });
    }

    const { book } = access;
    if (!book.coverUrl || !book.coverUrl.trim()) {
      return new NextResponse('Cover not found', {
        status: 404,
        headers: NO_CACHE_HEADERS,
      });
    }

    const coverUrl = book.coverUrl.trim();

    // 3. External HTTP(S) URL: Validate against trusted domains to block SSRF / Open Redirects
    if (coverUrl.startsWith('http://') || coverUrl.startsWith('https://')) {
      try {
        const parsed = new URL(coverUrl);
        const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';

        // Disallow unencrypted HTTP in production
        if (parsed.protocol !== 'https:' && !isLocal) {
          return new NextResponse('Insecure cover URL protocol: HTTPS required', {
            status: 400,
            headers: NO_CACHE_HEADERS,
          });
        }

        const hostname = parsed.hostname.toLowerCase();
        const projectHost = getProjectSupabaseHost();
        const isTrusted =
          TRUSTED_EXTERNAL_COVER_DOMAINS.includes(hostname) ||
          (projectHost !== null && hostname === projectHost) ||
          (isLocal && process.env.NODE_ENV !== 'production');

        if (!isTrusted) {
          return new NextResponse('Untrusted external cover URL domain', {
            status: 400,
            headers: NO_CACHE_HEADERS,
          });
        }

        return NextResponse.redirect(coverUrl, {
          status: 307,
          headers: getSuccessCacheHeaders(book.isPublic),
        });
      } catch {
        return new NextResponse('Malformed external cover URL', {
          status: 400,
          headers: NO_CACHE_HEADERS,
        });
      }
    }

    // 4. Data URL: parse base64 and stream binary directly (strictly raster formats; reject SVG)
    if (coverUrl.startsWith('data:')) {
      const match = coverUrl.match(/^data:(image\/(jpeg|png|webp|avif));base64,(.+)$/);
      if (!match) {
        return new NextResponse('Invalid or non-raster image data URL format', {
          status: 400,
          headers: NO_CACHE_HEADERS,
        });
      }
      const contentType = match[1];
      const buffer = Buffer.from(match[3], 'base64');
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': contentType,
          ...getSuccessCacheHeaders(book.isPublic),
        },
      });
    }

    // 5. Supabase Storage Object Path Integrity Verification
    // Reject directory traversal attempts
    if (
      coverUrl.includes('..') ||
      coverUrl.includes('\\') ||
      coverUrl.includes('%2e') ||
      coverUrl.includes('%2E')
    ) {
      return new NextResponse('Unsafe storage path: path traversal detected', {
        status: 400,
        headers: NO_CACHE_HEADERS,
      });
    }

    // Enforce tenant prefix matching the book's tenant_id (storage tenant isolation)
    const expectedTenantPrefix = `${book.tenantId}/`;
    if (!coverUrl.startsWith(expectedTenantPrefix)) {
      return new NextResponse('Invalid storage path: cross-tenant access denied', {
        status: 403,
        headers: NO_CACHE_HEADERS,
      });
    }

    // Prevent reading document binary (e.g. EPUB/PDF storage path) as a cover
    if (book.storagePath && coverUrl === book.storagePath) {
      return new NextResponse('Invalid storage path: document binary cannot be served as cover', {
        status: 400,
        headers: NO_CACHE_HEADERS,
      });
    }

    // Validate that the file extension is a recognized raster image format (SVG explicitly rejected)
    if (!ALLOWED_IMAGE_EXTENSIONS.test(coverUrl)) {
      return new NextResponse('Invalid file type: cover must be a raster image file (JPEG, PNG, WebP, AVIF)', {
        status: 400,
        headers: NO_CACHE_HEADERS,
      });
    }

    // 6. Fetch from private Supabase Storage bucket
    const admin = createAdminClient();
    const { data: fileData, error: downloadError } = await admin.storage
      .from('books')
      .download(coverUrl);

    if (!downloadError && fileData) {
      const ext = coverUrl.split('.').pop()?.toLowerCase();
      const rawType = fileData.type;
      const allowedMimes = Object.values(EXTENSION_MIME_MAP);
      const contentType =
        rawType && allowedMimes.includes(rawType)
          ? rawType
          : (ext && EXTENSION_MIME_MAP[ext]) || 'image/jpeg';

      const arrayBuffer = await fileData.arrayBuffer();
      return new NextResponse(arrayBuffer, {
        headers: {
          'Content-Type': contentType,
          ...getSuccessCacheHeaders(book.isPublic),
        },
      });
    }

    // Secondary fallback: generate temporary signed URL redirect if binary streaming encounters an issue
    // Keep token lifetime short (300 seconds) and cache matching token validity without stale-while-revalidate
    const { data: signedData, error: signError } = await admin.storage
      .from('books')
      .createSignedUrl(coverUrl, 300);

    if (!signError && signedData?.signedUrl) {
      return NextResponse.redirect(signedData.signedUrl, {
        status: 307,
        headers: {
          'Cache-Control': 'private, max-age=300',
          'Vary': 'Cookie, Authorization',
          ...SECURITY_HEADERS,
        },
      });
    }

    return new NextResponse('Cover image could not be loaded from storage', {
      status: 404,
      headers: NO_CACHE_HEADERS,
    });
  } catch (err) {
    console.error('Failed to serve book cover:', err);
    return new NextResponse('Internal server error', {
      status: 500,
      headers: NO_CACHE_HEADERS,
    });
  }
}
