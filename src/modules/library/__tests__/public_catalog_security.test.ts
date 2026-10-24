import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAllPublicBooks, getTenantBooks } from '../service';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}));

import { createClient, createAdminClient } from '@/lib/supabase/server';

describe('Public Catalog & Tenant Books Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAllPublicBooks', () => {
    it('strictly filters to is_public = true on the primary user client path', async () => {
      const mockEq = vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'book-pub-1',
              tenant_id: 'tenant-1',
              title: 'Public Book 1',
              is_public: true,
              format: 'epub',
              created_at: '2026-10-24T00:00:00Z',
              updated_at: '2026-10-24T00:00:00Z',
            },
          ],
          error: null,
        }),
      });

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: mockEq,
        }),
      });

      vi.mocked(createClient).mockResolvedValue({
        from: mockFrom,
      } as never);

      const books = await getAllPublicBooks();
      expect(mockEq).toHaveBeenCalledWith('is_public', true);
      expect(books).toHaveLength(1);
      expect(books[0].id).toBe('book-pub-1');
      expect(createAdminClient).not.toHaveBeenCalled();
    });

    it('strictly filters to is_public = true on the admin client fallback path when primary client fails', async () => {
      // Primary client returns error
      const mockPrimaryFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Network or session error' },
            }),
          }),
        }),
      });

      vi.mocked(createClient).mockResolvedValue({
        from: mockPrimaryFrom,
      } as never);

      // Admin client fallback
      const mockAdminEq = vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'book-pub-fallback',
              tenant_id: 'tenant-source',
              title: 'Public Fallback Book',
              is_public: true,
              format: 'epub',
              created_at: '2026-10-24T00:00:00Z',
              updated_at: '2026-10-24T00:00:00Z',
            },
          ],
          error: null,
        }),
      });

      const mockAdminFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: mockAdminEq,
        }),
      });

      vi.mocked(createAdminClient).mockReturnValue({
        from: mockAdminFrom,
      } as never);

      const books = await getAllPublicBooks();
      expect(createAdminClient).toHaveBeenCalled();
      expect(mockAdminEq).toHaveBeenCalledWith('is_public', true);
      expect(books).toHaveLength(1);
      expect(books[0].id).toBe('book-pub-fallback');
    });

    it('returns empty array if both primary and fallback queries fail', async () => {
      vi.mocked(createClient).mockResolvedValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: null, error: { message: 'Failed' } }),
            }),
          }),
        }),
      } as never);

      vi.mocked(createAdminClient).mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: null, error: { message: 'Admin failed' } }),
            }),
          }),
        }),
      } as never);

      const books = await getAllPublicBooks();
      expect(books).toEqual([]);
    });
  });

  describe('getTenantBooks', () => {
    it('fails closed and returns empty array if caller lacks tenant access via RLS', async () => {
      vi.mocked(createClient).mockResolvedValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'RLS permission denied' },
              }),
            }),
          }),
        }),
      } as never);

      const books = await getTenantBooks('foreign-tenant-id');
      expect(books).toEqual([]);
      // Confirms admin client fallback was removed and not invoked
      expect(createAdminClient).not.toHaveBeenCalled();
    });
  });
});
