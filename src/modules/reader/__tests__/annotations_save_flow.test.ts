import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAnnotationAction } from '../annotations/actions';
import * as authModule from '@/modules/auth';
import * as accessModule from '@/modules/reader/access';
import * as tenantModule from '@/modules/tenant';
import * as serviceModule from '../annotations/service';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/modules/auth', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/modules/tenant', () => ({
  getUserTenants: vi.fn(),
  findTenantRole: vi.fn(),
}));

vi.mock('@/modules/reader/access', () => ({
  verifyBookAccess: vi.fn(),
}));

vi.mock('../annotations/service', () => ({
  createAnnotation: vi.fn(),
}));

describe('Highlight Save Flow — createAnnotationAction', () => {
  const validUser = {
    id: 'user-1234-5678-90ab',
    email: 'reader@family.test',
    fullName: 'Test Reader',
  };

  const validBook = {
    id: 'book-1234-5678-90ab',
    tenantId: 'tenant-1234-5678-90ab',
    isPublic: true,
    title: 'The Great Adventure',
    author: 'Author Name',
    coverUrl: null,
    storagePath: 'books/test.epub',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fails with clear error when user is unauthenticated', async () => {
    vi.mocked(authModule.getCurrentUser).mockResolvedValue(null);

    const res = await createAnnotationAction({
      tenantId: 'tenant-1234-5678-90ab',
      bookId: 'book-1234-5678-90ab',
      location: 'page:1',
      highlightedText: 'Selected text from the page',
    });

    expect(res.error).toBe('Authentication required to create annotations.');
    expect(res.data).toBeUndefined();
    expect(serviceModule.createAnnotation).not.toHaveBeenCalled();
  });

  it('fails with clear error when bookId is missing or empty', async () => {
    vi.mocked(authModule.getCurrentUser).mockResolvedValue(validUser);

    const res = await createAnnotationAction({
      tenantId: 'tenant-1234-5678-90ab',
      bookId: '',
      location: 'page:1',
      highlightedText: 'Selected text from the page',
    });

    expect(res.error).toBe('Missing book identifier.');
    expect(res.data).toBeUndefined();
    expect(serviceModule.createAnnotation).not.toHaveBeenCalled();
  });

  it('fails with clear error when verifyBookAccess denies access', async () => {
    vi.mocked(authModule.getCurrentUser).mockResolvedValue(validUser);
    vi.mocked(accessModule.verifyBookAccess).mockResolvedValue({
      authorized: false,
      statusCode: 403,
      error: 'Access denied: You do not have permission to access this book',
    });

    const res = await createAnnotationAction({
      tenantId: 'tenant-1234-5678-90ab',
      bookId: 'book-1234-5678-90ab',
      location: 'page:1',
      highlightedText: 'Selected text from the page',
    });

    expect(res.error).toBe('Access denied: You do not have permission to access this book');
    expect(res.data).toBeUndefined();
    expect(serviceModule.createAnnotation).not.toHaveBeenCalled();
  });

  it('fails with clear error when highlightedText is empty or whitespace', async () => {
    vi.mocked(authModule.getCurrentUser).mockResolvedValue(validUser);
    vi.mocked(accessModule.verifyBookAccess).mockResolvedValue({
      authorized: true,
      book: validBook,
    });

    const res = await createAnnotationAction({
      tenantId: 'tenant-1234-5678-90ab',
      bookId: 'book-1234-5678-90ab',
      location: 'page:1',
      highlightedText: '   ',
    });

    expect(res.error).toBe('Highlighted text is required.');
    expect(res.data).toBeUndefined();
    expect(serviceModule.createAnnotation).not.toHaveBeenCalled();
  });

  it('fails with clear error when database insert in createAnnotation throws', async () => {
    vi.mocked(authModule.getCurrentUser).mockResolvedValue(validUser);
    vi.mocked(accessModule.verifyBookAccess).mockResolvedValue({
      authorized: true,
      book: validBook,
    });
    vi.mocked(serviceModule.createAnnotation).mockRejectedValue(
      new Error('insert or update on table "annotations" violates foreign key constraint')
    );

    const res = await createAnnotationAction({
      tenantId: 'tenant-1234-5678-90ab',
      bookId: 'book-1234-5678-90ab',
      location: 'page:1',
      highlightedText: 'Selected quote',
    });

    expect(res.error).toContain('Failed to save highlight: insert or update on table "annotations" violates foreign key constraint');
    expect(res.data).toBeUndefined();
  });

  it('succeeds and returns annotation data when all validations pass', async () => {
    vi.mocked(authModule.getCurrentUser).mockResolvedValue(validUser);
    vi.mocked(accessModule.verifyBookAccess).mockResolvedValue({
      authorized: true,
      book: validBook,
    });

    const mockSaved = {
      id: 'ann-1111',
      tenantId: validBook.tenantId,
      bookId: validBook.id,
      userId: validUser.id,
      location: 'page:1',
      highlightedText: 'Selected quote',
      note: 'My note',
      color: 'yellow' as const,
      isShared: false,
      createdAt: '2026-10-25T12:00:00Z',
      updatedAt: '2026-10-25T12:00:00Z',
    };
    vi.mocked(serviceModule.createAnnotation).mockResolvedValue(mockSaved);

    const res = await createAnnotationAction({
      tenantId: 'tenant-1234-5678-90ab',
      bookId: 'book-1234-5678-90ab',
      location: 'page:1',
      highlightedText: 'Selected quote',
      note: 'My note',
    });

    expect(res.success).toBe(true);
    expect(res.data).toEqual(mockSaved);
    expect(res.error).toBeUndefined();
  });

  it('saves annotation under user family tenant when annotating a public catalog book', async () => {
    vi.mocked(authModule.getCurrentUser).mockResolvedValue(validUser);
    vi.mocked(accessModule.verifyBookAccess).mockResolvedValue({
      authorized: true,
      book: {
        ...validBook,
        tenantId: 'platform-curator-tenant',
        isPublic: true,
      },
    });
    const membership: tenantModule.UserTenantMembership = {
      tenant: {
        id: 'tenant-family-smith',
        name: 'The Smiths',
        planTier: 'free',
        limits: {},
        createdAt: '2026-01-01T00:00:00Z',
      },
      role: 'reader',
    };
    vi.mocked(tenantModule.getUserTenants).mockResolvedValue([membership]);
    vi.mocked(tenantModule.findTenantRole).mockImplementation((memberships, targetId) => {
      const match = memberships.find((m) => m.tenant?.id === targetId);
      return match ? match.role : null;
    });

    const mockSaved = {
      id: 'ann-2222',
      tenantId: 'tenant-family-smith',
      bookId: validBook.id,
      userId: validUser.id,
      location: 'page:5',
      highlightedText: 'Public domain quote',
      note: 'Family reflection',
      color: 'green' as const,
      isShared: true,
      createdAt: '2026-10-25T12:00:00Z',
      updatedAt: '2026-10-25T12:00:00Z',
    };
    vi.mocked(serviceModule.createAnnotation).mockResolvedValue(mockSaved);

    const res = await createAnnotationAction({
      tenantId: 'tenant-family-smith',
      bookId: validBook.id,
      location: 'page:5',
      highlightedText: 'Public domain quote',
      note: 'Family reflection',
      color: 'green',
      isShared: true,
    });

    expect(res.success).toBe(true);
    expect(serviceModule.createAnnotation).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-family-smith',
        bookId: validBook.id,
        userId: validUser.id,
        color: 'green',
        isShared: true,
      })
    );
  });

  it('falls back to book tenant if user attempts to associate with an unauthorized tenant', async () => {
    vi.mocked(authModule.getCurrentUser).mockResolvedValue(validUser);
    vi.mocked(accessModule.verifyBookAccess).mockResolvedValue({
      authorized: true,
      book: validBook,
    });
    const membership: tenantModule.UserTenantMembership = {
      tenant: {
        id: 'tenant-1234-5678-90ab',
        name: 'Home Space',
        planTier: 'free',
        limits: {},
        createdAt: '2026-01-01T00:00:00Z',
      },
      role: 'reader',
    };
    vi.mocked(tenantModule.getUserTenants).mockResolvedValue([membership]);
    vi.mocked(tenantModule.findTenantRole).mockImplementation((memberships, targetId) => {
      const match = memberships.find((m) => m.tenant?.id === targetId);
      return match ? match.role : null;
    });

    const mockSaved = {
      id: 'ann-3333',
      tenantId: validBook.tenantId,
      bookId: validBook.id,
      userId: validUser.id,
      location: 'page:10',
      highlightedText: 'Legitimate text',
      color: 'yellow' as const,
      isShared: false,
      createdAt: '2026-10-25T12:00:00Z',
      updatedAt: '2026-10-25T12:00:00Z',
    };
    vi.mocked(serviceModule.createAnnotation).mockResolvedValue(mockSaved);

    await createAnnotationAction({
      tenantId: 'unauthorized-other-tenant',
      bookId: validBook.id,
      location: 'page:10',
      highlightedText: 'Legitimate text',
    });

    expect(serviceModule.createAnnotation).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: validBook.tenantId,
      })
    );
  });

  it('rejects highlighted text exceeding length limit', async () => {
    vi.mocked(authModule.getCurrentUser).mockResolvedValue(validUser);
    vi.mocked(accessModule.verifyBookAccess).mockResolvedValue({
      authorized: true,
      book: validBook,
    });

    const res = await createAnnotationAction({
      tenantId: validBook.tenantId,
      bookId: validBook.id,
      location: 'page:1',
      highlightedText: 'a'.repeat(5001),
    });

    expect(res.error).toBe('Highlighted text exceeds maximum allowed length (5000 characters).');
    expect(res.data).toBeUndefined();
  });
});
