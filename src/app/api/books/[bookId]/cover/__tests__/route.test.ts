import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';
import * as supabaseServer from '@/lib/supabase/server';
import * as readerAccess from '@/modules/reader/access';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock('@/modules/reader/access', () => ({
  verifyBookAccess: vi.fn(),
}));

describe('GET /api/books/[bookId]/cover Security & Authorization', () => {
  const mockStorageFrom = {
    download: vi.fn(),
    createSignedUrl: vi.fn(),
  };

  const mockAdminClient = {
    storage: {
      from: vi.fn(() => mockStorageFrom),
    },
  };

  const createMockRequest = (url = 'http://localhost:3000/api/books/book-123/cover') => {
    return new NextRequest(url);
  };

  type SupabaseClientType = Awaited<ReturnType<typeof supabaseServer.createClient>>;
  type AdminClientType = ReturnType<typeof supabaseServer.createAdminClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabaseServer.createAdminClient).mockReturnValue(
      mockAdminClient as unknown as AdminClientType
    );
  });

  // =========================================================================
  // SCENARIO 1: Unauthenticated Access
  // =========================================================================
  describe('Unauthenticated Access', () => {
    it('returns 401 Unauthorized with no-cache and nosniff headers when session is missing', async () => {
      vi.mocked(supabaseServer.createClient).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('No session') }),
        },
      } as unknown as SupabaseClientType);

      const req = createMockRequest();
      const res = await GET(req, { params: Promise.resolve({ bookId: 'book-123' }) });

      expect(res.status).toBe(401);
      expect(await res.text()).toBe('Unauthorized');
      expect(res.headers.get('Cache-Control')).toContain('no-store');
      expect(res.headers.get('Pragma')).toBe('no-cache');
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });
  });

  // =========================================================================
  // SCENARIO 2: Book Authorization Checks (Tenant Isolation & Permissions)
  // =========================================================================
  describe('Book Authorization Controls & Caching Dynamics', () => {
    beforeEach(() => {
      vi.mocked(supabaseServer.createClient).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'user-reader-1', email: 'reader@tenant-b.com' } },
            error: null,
          }),
        },
      } as unknown as SupabaseClientType);
    });

    it('returns 403 Forbidden with no-cache headers when accessing another tenant private book', async () => {
      vi.mocked(readerAccess.verifyBookAccess).mockResolvedValue({
        authorized: false,
        statusCode: 403,
        error: 'Forbidden: You do not have permission to access this book',
      });

      const req = createMockRequest();
      const res = await GET(req, { params: Promise.resolve({ bookId: 'book-private-tenant-a' }) });

      expect(res.status).toBe(403);
      expect(await res.text()).toContain('Forbidden');
      expect(res.headers.get('Cache-Control')).toContain('no-store');
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });

    it('returns 200 and streams cover binary with public cache headers for public catalog books', async () => {
      vi.mocked(readerAccess.verifyBookAccess).mockResolvedValue({
        authorized: true,
        book: {
          id: 'book-public-1',
          tenantId: 'tenant-source',
          isPublic: true,
          coverUrl: 'tenant-source/book-public-1-cover.jpg',
          storagePath: 'tenant-source/book-public-1.epub',
          title: 'Public Book',
          author: 'Author',
        },
      });

      const fakeImageBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
      mockStorageFrom.download.mockResolvedValue({
        data: {
          type: 'image/jpeg',
          arrayBuffer: vi.fn().mockResolvedValue(fakeImageBytes.buffer),
        },
        error: null,
      });

      const req = createMockRequest();
      const res = await GET(req, { params: Promise.resolve({ bookId: 'book-public-1' }) });

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('image/jpeg');
      expect(res.headers.get('Cache-Control')).toBe('private, max-age=3600, stale-while-revalidate=86400');
      expect(res.headers.get('Vary')).toBe('Cookie, Authorization');
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(mockStorageFrom.download).toHaveBeenCalledWith('tenant-source/book-public-1-cover.jpg');
    });

    it('returns 200 with must-revalidate short TTL for private tenant/family covers (access revocation)', async () => {
      vi.mocked(readerAccess.verifyBookAccess).mockResolvedValue({
        authorized: true,
        book: {
          id: 'book-private-authorized',
          tenantId: 'tenant-source',
          isPublic: false,
          coverUrl: 'tenant-source/private-cover.png',
          storagePath: 'tenant-source/private-book.epub',
          title: 'Private Book',
          author: 'Author',
        },
      });

      const fakeImageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
      mockStorageFrom.download.mockResolvedValue({
        data: {
          type: 'image/png',
          arrayBuffer: vi.fn().mockResolvedValue(fakeImageBytes.buffer),
        },
        error: null,
      });

      const req = createMockRequest();
      const res = await GET(req, { params: Promise.resolve({ bookId: 'book-private-authorized' }) });

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('image/png');
      expect(res.headers.get('Cache-Control')).toBe('private, max-age=300, must-revalidate');
      expect(res.headers.get('Vary')).toBe('Cookie, Authorization');
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });

    it('falls back to short-lived signed URL redirect (300s) without stale-while-revalidate', async () => {
      vi.mocked(readerAccess.verifyBookAccess).mockResolvedValue({
        authorized: true,
        book: {
          id: 'book-fallback-1',
          tenantId: 'tenant-source',
          isPublic: true,
          coverUrl: 'tenant-source/book-fallback-1-cover.jpg',
          storagePath: 'tenant-source/book-fallback-1.epub',
          title: 'Large Book',
          author: 'Author',
        },
      });

      // Storage download fails
      mockStorageFrom.download.mockResolvedValue({
        data: null,
        error: new Error('Stream timeout'),
      });

      // Storage signedUrl succeeds
      mockStorageFrom.createSignedUrl.mockResolvedValue({
        data: { signedUrl: 'https://project.supabase.co/storage/v1/object/sign/books/tenant-source/book-fallback-1-cover.jpg?token=abc' },
        error: null,
      });

      const req = createMockRequest();
      const res = await GET(req, { params: Promise.resolve({ bookId: 'book-fallback-1' }) });

      expect(res.status).toBe(307);
      expect(res.headers.get('Location')).toContain('https://project.supabase.co/storage/v1/object/sign/books');
      expect(res.headers.get('Cache-Control')).toBe('private, max-age=300');
      expect(res.headers.get('Vary')).toBe('Cookie, Authorization');
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(mockStorageFrom.createSignedUrl).toHaveBeenCalledWith('tenant-source/book-fallback-1-cover.jpg', 300);
    });
  });

  // =========================================================================
  // SCENARIO 3: Non-Existent Book or Missing Cover
  // =========================================================================
  describe('Non-Existent Book & Missing Assets', () => {
    beforeEach(() => {
      vi.mocked(supabaseServer.createClient).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'user-1', email: 'user@example.com' } },
            error: null,
          }),
        },
      } as unknown as SupabaseClientType);
    });

    it('returns 400 when bookId parameter is missing, empty, or exceeds 128 characters', async () => {
      const req = createMockRequest();
      const resEmpty = await GET(req, { params: Promise.resolve({ bookId: '   ' }) });
      expect(resEmpty.status).toBe(400);

      const resTooLong = await GET(req, { params: Promise.resolve({ bookId: 'a'.repeat(129) }) });
      expect(resTooLong.status).toBe(400);
      expect(resTooLong.headers.get('Cache-Control')).toContain('no-store');
    });

    it('returns 404 when book does not exist', async () => {
      vi.mocked(readerAccess.verifyBookAccess).mockResolvedValue({
        authorized: false,
        statusCode: 404,
        error: 'Book not found',
      });

      const req = createMockRequest();
      const res = await GET(req, { params: Promise.resolve({ bookId: 'unknown-book-id' }) });

      expect(res.status).toBe(404);
      expect(await res.text()).toBe('Book not found');
      expect(res.headers.get('Cache-Control')).toContain('no-store');
    });

    it('returns 404 when book exists but coverUrl is null or empty', async () => {
      vi.mocked(readerAccess.verifyBookAccess).mockResolvedValue({
        authorized: true,
        book: {
          id: 'book-no-cover',
          tenantId: 'tenant-1',
          isPublic: true,
          coverUrl: null,
          storagePath: 'tenant-1/book.epub',
          title: 'Book Without Cover',
          author: null,
        },
      });

      const req = createMockRequest();
      const res = await GET(req, { params: Promise.resolve({ bookId: 'book-no-cover' }) });

      expect(res.status).toBe(404);
      expect(await res.text()).toBe('Cover not found');
      expect(res.headers.get('Cache-Control')).toContain('no-store');
    });

    it('returns 404 when file is missing from storage and signed URL fails', async () => {
      vi.mocked(readerAccess.verifyBookAccess).mockResolvedValue({
        authorized: true,
        book: {
          id: 'book-missing-file',
          tenantId: 'tenant-1',
          isPublic: true,
          coverUrl: 'tenant-1/missing.jpg',
          storagePath: 'tenant-1/book.epub',
          title: 'Book Missing File',
          author: null,
        },
      });

      mockStorageFrom.download.mockResolvedValue({ data: null, error: new Error('Object not found') });
      mockStorageFrom.createSignedUrl.mockResolvedValue({ data: null, error: new Error('Object not found') });

      const req = createMockRequest();
      const res = await GET(req, { params: Promise.resolve({ bookId: 'book-missing-file' }) });

      expect(res.status).toBe(404);
      expect(await res.text()).toBe('Cover image could not be loaded from storage');
      expect(res.headers.get('Cache-Control')).toContain('no-store');
    });
  });

  // =========================================================================
  // SCENARIO 4: Storage Path Integrity, Cross-Tenant Access & Format Whitelist
  // =========================================================================
  describe('Storage Path Integrity & Raster-Only Enforcement', () => {
    beforeEach(() => {
      vi.mocked(supabaseServer.createClient).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'user-1', email: 'user@example.com' } },
            error: null,
          }),
        },
      } as unknown as SupabaseClientType);
    });

    it('rejects directory traversal attempts with 400 Bad Request', async () => {
      vi.mocked(readerAccess.verifyBookAccess).mockResolvedValue({
        authorized: true,
        book: {
          id: 'book-traversal',
          tenantId: 'tenant-1',
          isPublic: true,
          coverUrl: 'tenant-1/../../system/passwd.jpg',
          storagePath: 'tenant-1/book.epub',
          title: 'Exploit Book',
          author: null,
        },
      });

      const req = createMockRequest();
      const res = await GET(req, { params: Promise.resolve({ bookId: 'book-traversal' }) });

      expect(res.status).toBe(400);
      expect(await res.text()).toContain('path traversal detected');
      expect(mockStorageFrom.download).not.toHaveBeenCalled();
    });

    it('rejects backslash directory traversal attempts with 400 Bad Request', async () => {
      vi.mocked(readerAccess.verifyBookAccess).mockResolvedValue({
        authorized: true,
        book: {
          id: 'book-traversal-bs',
          tenantId: 'tenant-1',
          isPublic: true,
          coverUrl: 'tenant-1\\..\\other\\secret.png',
          storagePath: 'tenant-1/book.epub',
          title: 'Exploit Book',
          author: null,
        },
      });

      const req = createMockRequest();
      const res = await GET(req, { params: Promise.resolve({ bookId: 'book-traversal-bs' }) });

      expect(res.status).toBe(400);
      expect(await res.text()).toContain('path traversal detected');
      expect(mockStorageFrom.download).not.toHaveBeenCalled();
    });

    it('blocks cross-tenant storage path reference (tenant mismatch) with 403 Forbidden', async () => {
      vi.mocked(readerAccess.verifyBookAccess).mockResolvedValue({
        authorized: true,
        book: {
          id: 'book-mismatch',
          tenantId: 'tenant-alpha',
          isPublic: true,
          coverUrl: 'tenant-bravo/secret-cover.jpg',
          storagePath: 'tenant-alpha/book.epub',
          title: 'Mismatch Book',
          author: null,
        },
      });

      const req = createMockRequest();
      const res = await GET(req, { params: Promise.resolve({ bookId: 'book-mismatch' }) });

      expect(res.status).toBe(403);
      expect(await res.text()).toContain('cross-tenant access denied');
      expect(mockStorageFrom.download).not.toHaveBeenCalled();
    });

    it('rejects when coverUrl points to document binary (book storagePath) with 400', async () => {
      vi.mocked(readerAccess.verifyBookAccess).mockResolvedValue({
        authorized: true,
        book: {
          id: 'book-binary-leak',
          tenantId: 'tenant-1',
          isPublic: true,
          coverUrl: 'tenant-1/financial-book.pdf',
          storagePath: 'tenant-1/financial-book.pdf',
          title: 'Sensitive PDF',
          author: null,
        },
      });

      const req = createMockRequest();
      const res = await GET(req, { params: Promise.resolve({ bookId: 'book-binary-leak' }) });

      expect(res.status).toBe(400);
      expect(await res.text()).toContain('document binary cannot be served as cover');
      expect(mockStorageFrom.download).not.toHaveBeenCalled();
    });

    it('strictly rejects SVG covers to prevent XSS in same-origin with 400 Bad Request', async () => {
      vi.mocked(readerAccess.verifyBookAccess).mockResolvedValue({
        authorized: true,
        book: {
          id: 'book-svg-attack',
          tenantId: 'tenant-1',
          isPublic: true,
          coverUrl: 'tenant-1/cover.svg',
          storagePath: 'tenant-1/book.epub',
          title: 'SVG Attack Book',
          author: null,
        },
      });

      const req = createMockRequest();
      const res = await GET(req, { params: Promise.resolve({ bookId: 'book-svg-attack' }) });

      expect(res.status).toBe(400);
      expect(await res.text()).toContain('cover must be a raster image file');
      expect(mockStorageFrom.download).not.toHaveBeenCalled();
    });

    it('rejects non-image file extensions with 400 Bad Request', async () => {
      vi.mocked(readerAccess.verifyBookAccess).mockResolvedValue({
        authorized: true,
        book: {
          id: 'book-bad-ext',
          tenantId: 'tenant-1',
          isPublic: true,
          coverUrl: 'tenant-1/script.exe',
          storagePath: 'tenant-1/book.epub',
          title: 'Bad Extension',
          author: null,
        },
      });

      const req = createMockRequest();
      const res = await GET(req, { params: Promise.resolve({ bookId: 'book-bad-ext' }) });

      expect(res.status).toBe(400);
      expect(await res.text()).toContain('cover must be a raster image file');
      expect(mockStorageFrom.download).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // SCENARIO 5: External URLs & Open Redirect / SSRF Mitigation
  // =========================================================================
  describe('External URLs & Data URLs', () => {
    beforeEach(() => {
      vi.mocked(supabaseServer.createClient).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'user-1', email: 'user@example.com' } },
            error: null,
          }),
        },
      } as unknown as SupabaseClientType);
    });

    it('redirects to trusted external cover domains (OpenLibrary, Google Books)', async () => {
      vi.mocked(readerAccess.verifyBookAccess).mockResolvedValue({
        authorized: true,
        book: {
          id: 'book-openlibrary',
          tenantId: 'tenant-1',
          isPublic: true,
          coverUrl: 'https://covers.openlibrary.org/b/id/1052345-L.jpg',
          storagePath: 'tenant-1/book.epub',
          title: 'Open Library Book',
          author: null,
        },
      });

      const req = createMockRequest();
      const res = await GET(req, { params: Promise.resolve({ bookId: 'book-openlibrary' }) });

      expect(res.status).toBe(307);
      expect(res.headers.get('Location')).toBe('https://covers.openlibrary.org/b/id/1052345-L.jpg');
      expect(res.headers.get('Cache-Control')).toContain('private');
    });

    it('blocks untrusted arbitrary Supabase projects (subdomain exploit) with 400', async () => {
      vi.mocked(readerAccess.verifyBookAccess).mockResolvedValue({
        authorized: true,
        book: {
          id: 'book-attacker-supabase',
          tenantId: 'tenant-1',
          isPublic: true,
          coverUrl: 'https://attacker-project.supabase.co/storage/v1/object/public/covers/phish.jpg',
          storagePath: 'tenant-1/book.epub',
          title: 'Attacker Supabase Book',
          author: null,
        },
      });

      const req = createMockRequest();
      const res = await GET(req, { params: Promise.resolve({ bookId: 'book-attacker-supabase' }) });

      expect(res.status).toBe(400);
      expect(await res.text()).toContain('Untrusted external cover URL domain');
      expect(res.headers.get('Cache-Control')).toContain('no-store');
    });

    it('blocks untrusted external domains (Open Redirect / SSRF vector) with 400', async () => {
      vi.mocked(readerAccess.verifyBookAccess).mockResolvedValue({
        authorized: true,
        book: {
          id: 'book-phishing',
          tenantId: 'tenant-1',
          isPublic: true,
          coverUrl: 'https://malicious-phishing-site.com/exploit.jpg',
          storagePath: 'tenant-1/book.epub',
          title: 'Malicious Book',
          author: null,
        },
      });

      const req = createMockRequest();
      const res = await GET(req, { params: Promise.resolve({ bookId: 'book-phishing' }) });

      expect(res.status).toBe(400);
      expect(await res.text()).toContain('Untrusted external cover URL domain');
      expect(res.headers.get('Cache-Control')).toContain('no-store');
    });

    it('serves valid raster PNG data URL with base64 decoded buffer and Content-Type', async () => {
      // 1x1 transparent PNG base64
      const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const dataUrl = `data:image/png;base64,${pngBase64}`;

      vi.mocked(readerAccess.verifyBookAccess).mockResolvedValue({
        authorized: true,
        book: {
          id: 'book-data-url',
          tenantId: 'tenant-1',
          isPublic: true,
          coverUrl: dataUrl,
          storagePath: 'tenant-1/book.epub',
          title: 'Data URL Book',
          author: null,
        },
      });

      const req = createMockRequest();
      const res = await GET(req, { params: Promise.resolve({ bookId: 'book-data-url' }) });

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('image/png');
      expect(res.headers.get('Cache-Control')).toContain('private');
      const arrayBuffer = await res.arrayBuffer();
      expect(arrayBuffer.byteLength).toBeGreaterThan(0);
    });

    it('rejects data URL with SVG mime type with 400 Bad Request to prevent stored XSS', async () => {
      const svgDataUrl = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxzY3JpcHQ+YWxlcnQoMSk8L3NjcmlwdD48L3N2Zz4=';

      vi.mocked(readerAccess.verifyBookAccess).mockResolvedValue({
        authorized: true,
        book: {
          id: 'book-data-svg',
          tenantId: 'tenant-1',
          isPublic: true,
          coverUrl: svgDataUrl,
          storagePath: 'tenant-1/book.epub',
          title: 'SVG Data Book',
          author: null,
        },
      });

      const req = createMockRequest();
      const res = await GET(req, { params: Promise.resolve({ bookId: 'book-data-svg' }) });

      expect(res.status).toBe(400);
      expect(await res.text()).toContain('Invalid or non-raster image data URL format');
      expect(res.headers.get('Cache-Control')).toContain('no-store');
    });

    it('rejects data URL with non-image mime type with 400 Bad Request', async () => {
      const maliciousDataUrl = 'data:application/javascript;base64,YWxlcnQoMSk=';

      vi.mocked(readerAccess.verifyBookAccess).mockResolvedValue({
        authorized: true,
        book: {
          id: 'book-data-js',
          tenantId: 'tenant-1',
          isPublic: true,
          coverUrl: maliciousDataUrl,
          storagePath: 'tenant-1/book.epub',
          title: 'Script Data Book',
          author: null,
        },
      });

      const req = createMockRequest();
      const res = await GET(req, { params: Promise.resolve({ bookId: 'book-data-js' }) });

      expect(res.status).toBe(400);
      expect(await res.text()).toContain('Invalid or non-raster image data URL format');
      expect(res.headers.get('Cache-Control')).toContain('no-store');
    });
  });
});
