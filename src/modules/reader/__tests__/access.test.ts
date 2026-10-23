import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyBookAccess } from '../access';
import * as authModule from '@/modules/auth';
import * as supabaseServer from '@/lib/supabase/server';

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
}));

describe('verifyBookAccess Security Domain Service', () => {
  const mockAdminClient = {
    from: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabaseServer.createAdminClient).mockReturnValue(
      mockAdminClient as unknown as ReturnType<typeof supabaseServer.createAdminClient>
    );
  });

  it('rejects empty or whitespace-only userId with 401 Unauthorized', async () => {
    const resEmpty = await verifyBookAccess('', 'user@example.com', 'book-123');
    expect(resEmpty.authorized).toBe(false);
    expect(resEmpty.statusCode).toBe(401);

    const resWhitespace = await verifyBookAccess('   ', 'user@example.com', 'book-123');
    expect(resWhitespace.authorized).toBe(false);
    expect(resWhitespace.statusCode).toBe(401);
  });

  it('rejects empty or whitespace-only bookId with 404', async () => {
    const resEmpty = await verifyBookAccess('user-1', 'user@example.com', '');
    expect(resEmpty.authorized).toBe(false);
    expect(resEmpty.statusCode).toBe(404);

    const resWhitespace = await verifyBookAccess('user-1', 'user@example.com', '   ');
    expect(resWhitespace.authorized).toBe(false);
    expect(resWhitespace.statusCode).toBe(404);
  });

  it('returns 404 if the book does not exist in the database', async () => {
    mockAdminClient.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    });

    const res = await verifyBookAccess('user-1', 'user@example.com', 'non-existent-book');
    expect(res.authorized).toBe(false);
    expect(res.statusCode).toBe(404);
    expect(res.error).toBe('Book not found');
  });

  it('grants access if the user is Platform Super Admin even if book is private to another tenant', async () => {
    vi.spyOn(authModule, 'isPlatformSuperAdmin').mockResolvedValue(true);

    mockAdminClient.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: 'private-book-1',
              tenant_id: 'tenant-corporate',
              is_public: false,
              cover_url: 'tenant-corporate/private-book-1-cover.jpg',
              storage_path: 'tenant-corporate/private-book-1.epub',
              title: 'Confidential Internal Book',
              author: 'Company Exec',
            },
            error: null,
          }),
        }),
      }),
    });

    const res = await verifyBookAccess('superadmin-id', 'admin@readingroom.internal', 'private-book-1');
    expect(res.authorized).toBe(true);
    expect(res.book?.id).toBe('private-book-1');
    expect(res.book?.tenantId).toBe('tenant-corporate');
  });

  it('grants access if the book is marked is_public = true in the central catalog', async () => {
    vi.spyOn(authModule, 'isPlatformSuperAdmin').mockResolvedValue(false);

    mockAdminClient.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: 'public-book-1',
              tenant_id: 'tenant-uploader',
              is_public: true,
              cover_url: 'tenant-uploader/public-book-1-cover.jpg',
              storage_path: 'tenant-uploader/public-book-1.epub',
              title: 'The Great Gatsby',
              author: 'F. Scott Fitzgerald',
            },
            error: null,
          }),
        }),
      }),
    });

    const res = await verifyBookAccess('regular-reader-id', 'reader@family.com', 'public-book-1');
    expect(res.authorized).toBe(true);
    expect(res.book?.id).toBe('public-book-1');
    expect(res.book?.isPublic).toBe(true);
  });

  it('grants access if book is private but user is a member of the owning tenant', async () => {
    vi.spyOn(authModule, 'isPlatformSuperAdmin').mockResolvedValue(false);

    mockAdminClient.from.mockImplementation((table: string) => {
      if (table === 'books') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'tenant-book-1',
                  tenant_id: 'tenant-alpha',
                  is_public: false,
                  cover_url: 'tenant-alpha/tenant-book-1-cover.jpg',
                  storage_path: 'tenant-alpha/tenant-book-1.epub',
                  title: 'Alpha Private Journal',
                  author: 'Alpha Team',
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'tenant_members') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { role: 'reader' },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return { select: vi.fn() };
    });

    const res = await verifyBookAccess('member-user-id', 'member@alpha.com', 'tenant-book-1');
    expect(res.authorized).toBe(true);
    expect(res.book?.id).toBe('tenant-book-1');
  });

  it('denies access (403) if book is private and user does NOT belong to tenant or family', async () => {
    vi.spyOn(authModule, 'isPlatformSuperAdmin').mockResolvedValue(false);

    mockAdminClient.from.mockImplementation((table: string) => {
      if (table === 'books') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'tenant-secret-book',
                  tenant_id: 'tenant-secret',
                  is_public: false,
                  cover_url: 'tenant-secret/secret-cover.jpg',
                  storage_path: 'tenant-secret/secret.pdf',
                  title: 'Secret Diary',
                  author: null,
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'tenant_members') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'family_members') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }
      return { select: vi.fn() };
    });

    const res = await verifyBookAccess('outsider-user-id', 'outsider@other.com', 'tenant-secret-book');
    expect(res.authorized).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.error).toContain('Forbidden');
  });

  it('grants access if book is private but shared with the user through a family bookshelf', async () => {
    vi.spyOn(authModule, 'isPlatformSuperAdmin').mockResolvedValue(false);

    mockAdminClient.from.mockImplementation((table: string) => {
      if (table === 'books') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'family-shared-book',
                  tenant_id: 'tenant-uploader',
                  is_public: false,
                  cover_url: 'tenant-uploader/shared-cover.jpg',
                  storage_path: 'tenant-uploader/shared.epub',
                  title: 'Family Memories Book',
                  author: 'Grandpa',
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'tenant_members') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'family_members') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{ family_id: 'fam-uuid-1' }],
              error: null,
            }),
          }),
        };
      }
      if (table === 'family_books') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { book_id: 'family-shared-book' },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      return { select: vi.fn() };
    });

    const res = await verifyBookAccess('family-kid-id', 'kid@family.com', 'family-shared-book');
    expect(res.authorized).toBe(true);
    expect(res.book?.id).toBe('family-shared-book');
  });
});
