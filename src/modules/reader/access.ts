import { createAdminClient } from '@/lib/supabase/server';
import { isPlatformSuperAdmin } from '@/modules/auth';
import { canReadBooks } from '@/modules/entitlements';

export interface VerifiedBookRecord {
  id: string;
  tenantId: string;
  isPublic: boolean;
  coverUrl: string | null;
  storagePath: string | null;
  title: string;
  author: string | null;
  description?: string | null;
  fileSize?: number | null;
  format?: string;
  processingStatus?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type BookAccessSource = 'super_admin' | 'public' | 'tenant' | 'family';

export interface BookAccessResult {
  authorized: boolean;
  statusCode?: 401 | 403 | 404;
  error?: string;
  book?: VerifiedBookRecord;
  accessSource?: BookAccessSource;
  canShare?: boolean;
}

/**
 * Authorizes a user to access a specific book.
 * 
 * Access is granted if and only if:
 * 1. User is Platform Super Admin (SUPER_ADMIN_EMAIL / NEXT_PUBLIC_SUPER_ADMIN_EMAIL)
 * 2. Book is flagged as public in the catalog (is_public === true)
 * 3. User is an active tenant admin in the book's owning tenant (for unpublished drafts)
 * 4. Active member of a family whose bookshelf features the book
 *
 * Ordinary readers are strictly prohibited from reading or sharing unpublished books.
 * Only published books (is_public === true) may be shared to family bookshelves.
 *
 * If the book does not exist: returns 404
 * If the user is unauthenticated or unauthorized: returns 401 or 403 respectively
 */
export async function verifyBookAccess(
  userId: string,
  userEmail: string | null | undefined,
  bookId: string
): Promise<BookAccessResult> {
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    return { authorized: false, statusCode: 401, error: 'Authentication required' };
  }

  if (!bookId || typeof bookId !== 'string' || !bookId.trim() || bookId.length > 128) {
    return { authorized: false, statusCode: 404, error: 'Book not found' };
  }

  const cleanBookId = bookId.trim();
  const admin = createAdminClient();

  // 1. Fetch book record using admin client to read metadata
  const { data: bookRecord, error: bookError } = await admin
    .from('books')
    .select('id, tenant_id, is_public, cover_url, storage_path, title, author, description, file_size, format, processing_status, created_at, updated_at')
    .eq('id', cleanBookId)
    .maybeSingle();

  if (bookError || !bookRecord) {
    return { authorized: false, statusCode: 404, error: 'Book not found' };
  }

  const verifiedBook: VerifiedBookRecord = {
    id: bookRecord.id,
    tenantId: bookRecord.tenant_id,
    isPublic: Boolean(bookRecord.is_public),
    coverUrl: bookRecord.cover_url || null,
    storagePath: bookRecord.storage_path || null,
    title: bookRecord.title,
    author: bookRecord.author || null,
    description: bookRecord.description || null,
    fileSize: typeof bookRecord.file_size === 'number' ? bookRecord.file_size : null,
    format: bookRecord.format || 'epub',
    processingStatus: bookRecord.processing_status || 'ready',
    createdAt: bookRecord.created_at,
    updatedAt: bookRecord.updated_at,
  };

  // 2. Rule 1: Platform Super Admin has privileged access
  // Super Admin can inspect unpublished books, but unpublished books can NEVER be shared to family bookshelves
  let resolvedEmail = userEmail;
  if (!resolvedEmail && userId) {
    try {
      const { data: userData } = await admin.auth.admin.getUserById(userId);
      resolvedEmail = userData?.user?.email;
    } catch {
      // Best-effort fallback
    }
  }

  const isSuperAdmin = resolvedEmail ? await isPlatformSuperAdmin(resolvedEmail) : false;

  if (isSuperAdmin) {
    return {
      authorized: true,
      book: verifiedBook,
      accessSource: 'super_admin',
      canShare: verifiedBook.isPublic,
    };
  }

  // 3. Rule 2: Central public catalog books are readable and shareable by all authenticated readers
  if (verifiedBook.isPublic) {
    return {
      authorized: true,
      book: verifiedBook,
      accessSource: 'public',
      canShare: true,
    };
  }

  // 4. Rule 3: Direct tenant membership with reader/admin entitlement
  // - Ordinary readers must NOT read unpublished books, even if they belong to their tenant.
  // - Tenant admins can read their tenant's unpublished books, but cannot share unpublished books to family bookshelves.
  const { data: tenantMember } = await admin
    .from('tenant_members')
    .select('role')
    .eq('tenant_id', verifiedBook.tenantId)
    .eq('user_id', userId)
    .maybeSingle();

  if (tenantMember) {
    const isTenantAdmin = tenantMember.role === 'admin';
    // If book is published: readers and admins can read and share
    if (verifiedBook.isPublic && canReadBooks(tenantMember.role)) {
      return {
        authorized: true,
        book: verifiedBook,
        accessSource: 'tenant',
        canShare: true,
      };
    }
    // If book is unpublished: ONLY tenant admins can read; ordinary readers are denied
    if (!verifiedBook.isPublic && isTenantAdmin) {
      return {
        authorized: true,
        book: verifiedBook,
        accessSource: 'tenant',
        canShare: false,
      };
    }
  }

  // 5. Rule 4: Family shared bookshelf access
  // Active members of a family whose bookshelf features the book can read it (read-only, canShare: false).
  const { data: familyMemberships } = await admin
    .from('family_members')
    .select('family_id')
    .eq('user_id', userId);

  if (familyMemberships && familyMemberships.length > 0) {
    const familyIds = familyMemberships.map((m: { family_id: string }) => m.family_id);
    const { data: familyBook } = await admin
      .from('family_books')
      .select('book_id')
      .eq('book_id', cleanBookId)
      .in('family_id', familyIds)
      .limit(1)
      .maybeSingle();

    if (familyBook) {
      return {
        authorized: true,
        book: verifiedBook,
        accessSource: 'family',
        canShare: false,
      };
    }
  }

  // 6. Deny access if none of the authorization criteria are met
  return {
    authorized: false,
    statusCode: 403,
    error: 'Forbidden: You do not have permission to access this book',
    book: verifiedBook,
    canShare: false,
  };
}
