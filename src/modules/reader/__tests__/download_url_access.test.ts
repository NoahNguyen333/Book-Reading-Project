import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getAuthorizedBookDownloadUrl,
  saveReadingProgressAction,
  addBookmarkAction,
  deleteBookmarkAction,
} from '../actions';
import { getCurrentUser } from '@/modules/auth';
import { verifyBookAccess } from '@/modules/reader/access';
import { createAdminClient } from '@/lib/supabase/server';
import { upsertReadingProgress, createBookmark } from '../service';

vi.mock('@/modules/auth', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/modules/reader/access', () => ({
  verifyBookAccess: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock('../service', () => ({
  upsertReadingProgress: vi.fn(),
  createBookmark: vi.fn(),
  removeBookmark: vi.fn(),
}));

describe('Reader Security & Action Authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAuthorizedBookDownloadUrl', () => {
    it('rejects unauthenticated requests', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(null);

      const res = await getAuthorizedBookDownloadUrl('book-1');
      expect(res.error).toBe('Authentication required to access book.');
      expect(res.data).toBeUndefined();
    });

    it('denies download token when user lacks book access', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user-1',
        email: 'reader@example.com',
      });
      vi.mocked(verifyBookAccess).mockResolvedValue({
        authorized: false,
        statusCode: 403,
        error: 'Forbidden: You do not have permission to access this book',
      });

      const res = await getAuthorizedBookDownloadUrl('private-book-123');
      expect(res.error).toContain('Forbidden');
      expect(res.data).toBeUndefined();
    });

    it('generates signed download URL when book access is verified', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user-1',
        email: 'reader@example.com',
      });
      vi.mocked(verifyBookAccess).mockResolvedValue({
        authorized: true,
        book: {
          id: 'allowed-book-1',
          tenantId: 'tenant-abc',
          isPublic: false,
          coverUrl: null,
          storagePath: 'tenant-abc/allowed-book-1.epub',
          title: 'Allowed Book',
          author: 'Author',
        },
      });

      const mockCreateSignedUrl = vi.fn().mockResolvedValue({
        data: { signedUrl: 'https://storage.supabase.co/signed/token123' },
        error: null,
      });

      vi.mocked(createAdminClient).mockReturnValue({
        storage: {
          from: vi.fn().mockReturnValue({
            createSignedUrl: mockCreateSignedUrl,
          }),
        },
      } as unknown as ReturnType<typeof createAdminClient>);

      const res = await getAuthorizedBookDownloadUrl('allowed-book-1');
      expect(res.success).toBe(true);
      expect(res.data?.signedUrl).toBe('https://storage.supabase.co/signed/token123');
      expect(mockCreateSignedUrl).toHaveBeenCalledWith('tenant-abc/allowed-book-1.epub', 60);
    });
  });

  describe('saveReadingProgressAction', () => {
    it('verifies book access before saving reading progress', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user-1',
        email: 'reader@example.com',
      });
      vi.mocked(verifyBookAccess).mockResolvedValue({
        authorized: false,
        statusCode: 403,
        error: 'Forbidden',
      });

      const res = await saveReadingProgressAction('book-1', 'tenant-1', 'epubcfi(/6/2)', 50);
      expect(res.error).toContain('Forbidden');
      expect(upsertReadingProgress).not.toHaveBeenCalled();
    });

    it('saves progress and enforces tenant identity from verified book record', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user-1',
        email: 'reader@example.com',
      });
      vi.mocked(verifyBookAccess).mockResolvedValue({
        authorized: true,
        book: {
          id: 'book-1',
          tenantId: 'verified-tenant-id',
          isPublic: true,
          coverUrl: null,
          storagePath: 'verified-tenant-id/book-1.epub',
          title: 'Public Book',
          author: null,
        },
      });

      const res = await saveReadingProgressAction('book-1', 'spoofed-tenant-id', 'epubcfi(/6/2)', 75);
      expect(res.success).toBe(true);
      expect(upsertReadingProgress).toHaveBeenCalledWith(
        'user-1',
        'verified-tenant-id',
        'book-1',
        'epubcfi(/6/2)',
        75
      );
    });
  });

  describe('addBookmarkAction', () => {
    it('verifies book access before adding bookmark', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        id: 'user-1',
        email: 'reader@example.com',
      });
      vi.mocked(verifyBookAccess).mockResolvedValue({
        authorized: false,
        statusCode: 403,
        error: 'Access denied',
      });

      const res = await addBookmarkAction('book-1', 'tenant-1', 'cfi-loc', 'Chapter 1');
      expect(res.error).toContain('Access denied');
      expect(createBookmark).not.toHaveBeenCalled();
    });
  });

  describe('deleteBookmarkAction', () => {
    it('requires authenticated user and non-empty bookmarkId', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue(null);
      const res1 = await deleteBookmarkAction('bm-1');
      expect(res1.error).toBe('Authentication required.');

      vi.mocked(getCurrentUser).mockResolvedValue({ id: 'u1' });
      const res2 = await deleteBookmarkAction('');
      expect(res2.error).toBe('Missing bookmark identifier.');
    });
  });
});
