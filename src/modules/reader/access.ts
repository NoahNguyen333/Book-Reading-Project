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
}

export interface BookAccessResult {
  authorized: boolean;
  statusCode?: 401 | 403 | 404;
  error?: string;
  book?: VerifiedBookRecord;
}

/**
 * Authorizes a user to access a specific book.
 * 
 * Access is granted if and only if:
 * 1. User is Platform Super Admin (process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL)
 * 2. Book is flagged as public in the catalog (is_public === true)
 * 3. User is an active member with read entitlements in the book's owning tenant
 * 4. Book is featured in a family bookshelf where the user is an active family member
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
    .select('id, tenant_id, is_public, cover_url, storage_path, title, author')
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
  };

  // 2. Rule 1: Platform Super Admin has universal access
  if (userEmail && (await isPlatformSuperAdmin(userEmail))) {
    return { authorized: true, book: verifiedBook };
  }

  // 3. Rule 2: Central public catalog books are readable by all authenticated readers
  if (verifiedBook.isPublic) {
    return { authorized: true, book: verifiedBook };
  }

  // 4. Rule 3: Direct tenant membership with reader/admin entitlement
  const { data: tenantMember } = await admin
    .from('tenant_members')
    .select('role')
    .eq('tenant_id', verifiedBook.tenantId)
    .eq('user_id', userId)
    .maybeSingle();

  if (tenantMember && canReadBooks(tenantMember.role)) {
    return { authorized: true, book: verifiedBook };
  }

  // 5. Rule 4: Family shared bookshelf access
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
      return { authorized: true, book: verifiedBook };
    }
  }

  // 6. Deny access if none of the authorization criteria are met
  return {
    authorized: false,
    statusCode: 403,
    error: 'Forbidden: You do not have permission to access this book',
    book: verifiedBook,
  };
}
