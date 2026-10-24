import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addBookToFamilyBookshelfAction } from '../actions';
import { getCurrentUser } from '@/modules/auth';
import { verifyBookAccess } from '@/modules/reader/access';
import { addBookToFamilyBookshelf, getUserFamily } from '../service';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/modules/auth', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/modules/reader/access', () => ({
  verifyBookAccess: vi.fn(),
}));

vi.mock('../service', () => ({
  addBookToFamilyBookshelf: vi.fn(),
  getUserFamily: vi.fn(),
}));

describe('Family Bookshelf Sharing & Onward Re-sharing Boundary', () => {
  const familyId = 'family-1111-2222-3333-444444444444';
  const bookId = 'book-5555-6666-7777-888888888888';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated users from adding books to family bookshelf', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await addBookToFamilyBookshelfAction(familyId, bookId);
    expect(res.error).toBe('Vui lòng đăng nhập.');
    expect(addBookToFamilyBookshelf).not.toHaveBeenCalled();
  });

  it('rejects users who are not members of the target family', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: 'user-1' });
    vi.mocked(getUserFamily).mockResolvedValue(null);

    const res = await addBookToFamilyBookshelfAction(familyId, bookId);
    expect(res.error).toBe('Bạn không thuộc không gian gia đình này.');
    expect(addBookToFamilyBookshelf).not.toHaveBeenCalled();
  });

  it('rejects regular readers who do not have admin or moderator permissions', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: 'user-1' });
    vi.mocked(getUserFamily).mockResolvedValue({
      family: { id: familyId } as never,
      memberRole: 'reader',
      members: [],
    });

    const res = await addBookToFamilyBookshelfAction(familyId, bookId);
    expect(res.error).toBe('Chỉ Admin hoặc Moderator mới có quyền thêm sách vào tủ sách gia đình.');
    expect(addBookToFamilyBookshelf).not.toHaveBeenCalled();
  });

  it('permits sharing a public catalog book (canShare: true)', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: 'user-admin', email: 'admin@family.com' });
    vi.mocked(getUserFamily).mockResolvedValue({
      family: { id: familyId } as never,
      memberRole: 'admin',
      members: [],
    });
    vi.mocked(verifyBookAccess).mockResolvedValue({
      authorized: true,
      canShare: true,
      accessSource: 'public',
      book: {
        id: bookId,
        title: 'Public Book',
        tenantId: 'tenant-source',
        isPublic: true,
        coverUrl: null,
        storagePath: 'tenant-source/book.epub',
        author: 'Author',
      },
    });

    const res = await addBookToFamilyBookshelfAction(familyId, bookId);
    expect(res.success).toBe(true);
    expect(addBookToFamilyBookshelf).toHaveBeenCalledWith(familyId, bookId, 'user-admin', 'admin@family.com');
  });

  it('strictly blocks sharing an unpublished private book even when user is a tenant admin', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: 'user-admin', email: 'admin@family.com' });
    vi.mocked(getUserFamily).mockResolvedValue({
      family: { id: familyId } as never,
      memberRole: 'moderator',
      members: [],
    });
    vi.mocked(verifyBookAccess).mockResolvedValue({
      authorized: true,
      canShare: false,
      accessSource: 'tenant',
      book: {
        id: bookId,
        title: 'Personal Uploaded Book',
        tenantId: 'user-personal-tenant',
        isPublic: false,
        coverUrl: null,
        storagePath: 'user-personal-tenant/book.epub',
        author: 'Author',
      },
    });

    const res = await addBookToFamilyBookshelfAction(familyId, bookId);
    expect(res.error).toContain('Chỉ sách đã xuất bản');
    expect(addBookToFamilyBookshelf).not.toHaveBeenCalled();
  });

  it('strictly blocks sharing a private tenant book if user is only a tenant reader (canShare: false)', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: 'user-reader', email: 'reader@family.com' });
    vi.mocked(getUserFamily).mockResolvedValue({
      family: { id: familyId } as never,
      memberRole: 'admin',
      members: [],
    });
    vi.mocked(verifyBookAccess).mockResolvedValue({
      authorized: true,
      canShare: false,
      accessSource: 'tenant',
      book: {
        id: bookId,
        title: 'Private Org Book',
        tenantId: 'tenant-org',
        isPublic: false,
        coverUrl: null,
        storagePath: 'tenant-org/book.epub',
        author: 'Author',
      },
    });

    const res = await addBookToFamilyBookshelfAction(familyId, bookId);
    expect(res.error).toContain('Chỉ sách đã xuất bản');
    expect(addBookToFamilyBookshelf).not.toHaveBeenCalled();
  });

  it('strictly blocks sharing an unpublished private book even for a Platform Super Admin', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: 'super-admin', email: 'superadmin@internal.com' });
    vi.mocked(getUserFamily).mockResolvedValue({
      family: { id: familyId } as never,
      memberRole: 'admin',
      members: [],
    });
    vi.mocked(verifyBookAccess).mockResolvedValue({
      authorized: true,
      canShare: false,
      accessSource: 'super_admin',
      book: {
        id: bookId,
        title: 'Any Org Private Book',
        tenantId: 'tenant-any',
        isPublic: false,
        coverUrl: null,
        storagePath: 'tenant-any/book.epub',
        author: 'Author',
      },
    });

    const res = await addBookToFamilyBookshelfAction(familyId, bookId);
    expect(res.error).toContain('Chỉ sách đã xuất bản');
    expect(addBookToFamilyBookshelf).not.toHaveBeenCalled();
  });

  it('strictly blocks onward re-sharing of a private book accessible only via another family (canShare: false)', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: 'user-admin', email: 'admin@family.com' });
    vi.mocked(getUserFamily).mockResolvedValue({
      family: { id: familyId } as never,
      memberRole: 'admin',
      members: [],
    });
    vi.mocked(verifyBookAccess).mockResolvedValue({
      authorized: true,
      canShare: false, // Accessible for reading only via a different family
      accessSource: 'family',
      book: {
        id: bookId,
        title: 'Private Book from Another Family',
        tenantId: 'third-party-tenant',
        isPublic: false,
        coverUrl: null,
        storagePath: 'third-party-tenant/private.epub',
        author: 'Unknown',
      },
    });

    const res = await addBookToFamilyBookshelfAction(familyId, bookId);
    expect(res.error).toContain('Chỉ sách đã xuất bản');
    expect(addBookToFamilyBookshelf).not.toHaveBeenCalled();
  });

  it('denies sharing when user has no access to the book at all', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: 'user-admin', email: 'admin@family.com' });
    vi.mocked(getUserFamily).mockResolvedValue({
      family: { id: familyId } as never,
      memberRole: 'admin',
      members: [],
    });
    vi.mocked(verifyBookAccess).mockResolvedValue({
      authorized: false,
      statusCode: 403,
      canShare: false,
      error: 'Forbidden',
    });

    const res = await addBookToFamilyBookshelfAction(familyId, bookId);
    expect(res.error).toBe('Bạn không có quyền truy cập cuốn sách này.');
    expect(addBookToFamilyBookshelf).not.toHaveBeenCalled();
  });
});
