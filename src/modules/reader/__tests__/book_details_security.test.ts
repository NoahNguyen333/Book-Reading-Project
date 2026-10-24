import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getBookDetails } from '../service';
import { createClient } from '@/lib/supabase/server';
import { verifyBookAccess } from '../access';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock('../access', () => ({
  verifyBookAccess: vi.fn(),
}));

describe('getBookDetails Security Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null if bookId is empty or whitespace', async () => {
    const res1 = await getBookDetails('');
    const res2 = await getBookDetails('   ');
    expect(res1).toBeNull();
    expect(res2).toBeNull();
  });

  describe('Unauthenticated callers', () => {
    it('returns null when requesting an unpublished book', async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      };
      vi.mocked(createClient).mockResolvedValue(mockSupabase as unknown as Awaited<ReturnType<typeof createClient>>);

      const res = await getBookDetails('private-book-123');
      expect(res).toBeNull();

      expect(mockSupabase.from).toHaveBeenCalledWith('books');
    });

    it('returns book details when requesting an explicitly public book', async () => {
      const mockBookData = {
        id: 'public-book-1',
        tenant_id: 'tenant-1',
        title: 'Public Book',
        author: 'Jane Doe',
        description: 'A great book',
        cover_url: 'https://example.com/cover.jpg',
        storage_path: 'tenant-1/public-book-1.epub',
        file_size: 1024,
        format: 'epub',
        processing_status: 'ready',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
        is_public: true,
      };

      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col) => {
              if (col === 'id') {
                return {
                  eq: vi.fn().mockImplementation((col2, val2) => {
                    if (col2 === 'is_public' && val2 === true) {
                      return {
                        maybeSingle: vi.fn().mockResolvedValue({ data: mockBookData, error: null }),
                      };
                    }
                    return { maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
                  }),
                };
              }
              return { eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn() }) };
            }),
          }),
        }),
      };
      vi.mocked(createClient).mockResolvedValue(mockSupabase as unknown as Awaited<ReturnType<typeof createClient>>);

      const res = await getBookDetails('public-book-1');
      expect(res).not.toBeNull();
      expect(res?.id).toBe('public-book-1');
      expect(res?.title).toBe('Public Book');
      expect(res?.tenantId).toBe('tenant-1');
    });

    it('returns null if public book does not match requested tenantId', async () => {
      const mockBookData = {
        id: 'public-book-1',
        tenant_id: 'tenant-1',
        title: 'Public Book',
        author: 'Jane Doe',
        description: 'A great book',
        cover_url: 'https://example.com/cover.jpg',
        storage_path: 'tenant-1/public-book-1.epub',
        file_size: 1024,
        format: 'epub',
        processing_status: 'ready',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
        is_public: true,
      };

      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: mockBookData, error: null }),
              }),
            }),
          }),
        }),
      };
      vi.mocked(createClient).mockResolvedValue(mockSupabase as unknown as Awaited<ReturnType<typeof createClient>>);

      const res = await getBookDetails('public-book-1', 'tenant-different');
      expect(res).toBeNull();
    });
  });

  describe('Authenticated callers', () => {
    it('returns null when verifyBookAccess denies access', async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'reader-1', email: 'reader@example.com' } },
          }),
        },
      };
      vi.mocked(createClient).mockResolvedValue(mockSupabase as unknown as Awaited<ReturnType<typeof createClient>>);

      vi.mocked(verifyBookAccess).mockResolvedValue({
        authorized: false,
        statusCode: 403,
        error: 'Forbidden',
      });

      const res = await getBookDetails('private-book-1');
      expect(res).toBeNull();
      expect(verifyBookAccess).toHaveBeenCalledWith('reader-1', 'reader@example.com', 'private-book-1');
    });

    it('returns null when caller tenantId parameter mismatches verified book tenantId', async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'admin-1', email: 'admin@example.com' } },
          }),
        },
      };
      vi.mocked(createClient).mockResolvedValue(mockSupabase as unknown as Awaited<ReturnType<typeof createClient>>);

      vi.mocked(verifyBookAccess).mockResolvedValue({
        authorized: true,
        book: {
          id: 'private-book-1',
          tenantId: 'tenant-a',
          title: 'Private Book A',
          author: 'Author A',
          isPublic: false,
          coverUrl: null,
          storagePath: 'tenant-a/book.epub',
        },
      });

      const res = await getBookDetails('private-book-1', 'tenant-b');
      expect(res).toBeNull();
    });

    it('returns book details when tenant admin is authorized to read private book', async () => {
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'admin-1', email: 'admin@example.com' } },
          }),
        },
      };
      vi.mocked(createClient).mockResolvedValue(mockSupabase as unknown as Awaited<ReturnType<typeof createClient>>);

      vi.mocked(verifyBookAccess).mockResolvedValue({
        authorized: true,
        book: {
          id: 'private-book-1',
          tenantId: 'tenant-a',
          title: 'Private Book A',
          author: 'Author A',
          description: 'Top secret',
          isPublic: false,
          coverUrl: 'https://example.com/cover.jpg',
          storagePath: 'tenant-a/book.epub',
          fileSize: 2048,
          format: 'epub',
          processingStatus: 'ready',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-02T00:00:00Z',
        },
      });

      const res = await getBookDetails('private-book-1', 'tenant-a');
      expect(res).not.toBeNull();
      expect(res?.id).toBe('private-book-1');
      expect(res?.title).toBe('Private Book A');
      expect(res?.description).toBe('Top secret');
      expect(res?.tenantId).toBe('tenant-a');
    });
  });
});
