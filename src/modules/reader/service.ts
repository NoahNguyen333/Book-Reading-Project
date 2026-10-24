import { createClient, createAdminClient } from '@/lib/supabase/server';
import { ReadingProgress, Bookmark } from './types';
import { Book } from '@/modules/library/types';
import { verifyBookAccess } from './access';

/**
 * Retrieves book details by ID, enforcing strict caller authorization.
 * Unpublished books are never returned to unauthorized or unauthenticated callers.
 */
export async function getBookDetails(
  bookId: string,
  tenantId?: string
): Promise<Book | null> {
  const cleanBookId = bookId?.trim();
  if (!cleanBookId) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const access = await verifyBookAccess(user.id, user.email, cleanBookId);
    if (!access.authorized || !access.book) {
      return null;
    }

    if (tenantId && access.book.tenantId !== tenantId) {
      return null;
    }

    return {
      id: access.book.id,
      tenantId: access.book.tenantId,
      title: access.book.title,
      author: access.book.author,
      description: access.book.description || null,
      coverUrl: access.book.coverUrl,
      storagePath: access.book.storagePath,
      fileSize: access.book.fileSize || null,
      format: access.book.format || 'epub',
      processingStatus: access.book.processingStatus || 'ready',
      createdAt: access.book.createdAt || new Date().toISOString(),
      updatedAt: access.book.updatedAt || new Date().toISOString(),
    };
  }

  // Unauthenticated caller: strictly restricted to explicitly public catalog books
  const { data: publicBook } = await supabase
    .from('books')
    .select('*')
    .eq('id', cleanBookId)
    .eq('is_public', true)
    .maybeSingle();

  if (!publicBook) return null;
  if (tenantId && publicBook.tenant_id !== tenantId) return null;

  return {
    id: publicBook.id,
    tenantId: publicBook.tenant_id,
    title: publicBook.title,
    author: publicBook.author,
    description: publicBook.description,
    coverUrl: publicBook.cover_url,
    storagePath: publicBook.storage_path,
    fileSize: publicBook.file_size,
    format: publicBook.format,
    processingStatus: publicBook.processing_status,
    createdAt: publicBook.created_at,
    updatedAt: publicBook.updated_at,
  };
}

/**
 * Retrieves the user's saved reading progress for a specific book.
 */
export async function getUserReadingProgress(
  bookId: string,
  userId: string
): Promise<ReadingProgress | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('reading_progress')
    .select('*')
    .eq('book_id', bookId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    const admin = createAdminClient();
    const { data: adminData } = await admin
      .from('reading_progress')
      .select('*')
      .eq('book_id', bookId)
      .eq('user_id', userId)
      .maybeSingle();

    if (!adminData) return null;

    return {
      id: adminData.id,
      tenantId: adminData.tenant_id,
      bookId: adminData.book_id,
      userId: adminData.user_id,
      cfi: adminData.cfi,
      percentage: Number(adminData.percentage) || 0,
      updatedAt: adminData.updated_at,
    };
  }

  return {
    id: data.id,
    tenantId: data.tenant_id,
    bookId: data.book_id,
    userId: data.user_id,
    cfi: data.cfi,
    percentage: Number(data.percentage) || 0,
    updatedAt: data.updated_at,
  };
}

/**
 * Retrieves all saved bookmarks for a user on a given book.
 */
export async function getBookmarks(
  bookId: string,
  userId: string
): Promise<Bookmark[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('bookmarks')
    .select('*')
    .eq('book_id', bookId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error || !data) {
    const admin = createAdminClient();
    const { data: adminData } = await admin
      .from('bookmarks')
      .select('*')
      .eq('book_id', bookId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (!adminData) return [];

    return adminData.map((b) => ({
      id: b.id,
      tenantId: b.tenant_id,
      bookId: b.book_id,
      userId: b.user_id,
      cfi: b.cfi,
      label: b.label,
      createdAt: b.created_at,
    }));
  }

  return data.map((b) => ({
    id: b.id,
    tenantId: b.tenant_id,
    bookId: b.book_id,
    userId: b.user_id,
    cfi: b.cfi,
    label: b.label,
    createdAt: b.created_at,
  }));
}

/**
 * Upserts a user's reading progress (CFI location and percentage) for a book.
 */
export async function upsertReadingProgress(
  userId: string,
  tenantId: string,
  bookId: string,
  cfi: string,
  percentage: number
): Promise<ReadingProgress> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('reading_progress')
    .upsert(
      {
        user_id: userId,
        tenant_id: tenantId,
        book_id: bookId,
        cfi,
        percentage: Math.min(100, Math.max(0, percentage)),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,book_id' }
    )
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to save reading progress: ${error?.message || 'Unknown error'}`);
  }

  return {
    id: data.id,
    tenantId: data.tenant_id,
    bookId: data.book_id,
    userId: data.user_id,
    cfi: data.cfi,
    percentage: Number(data.percentage) || 0,
    updatedAt: data.updated_at,
  };
}

/**
 * Adds a bookmark anchor on a book for a user.
 */
export async function createBookmark(
  userId: string,
  tenantId: string,
  bookId: string,
  cfi: string,
  label?: string | null
): Promise<Bookmark> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('bookmarks')
    .insert({
      user_id: userId,
      tenant_id: tenantId,
      book_id: bookId,
      cfi,
      label: label?.trim() || null,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create bookmark: ${error?.message || 'Unknown error'}`);
  }

  return {
    id: data.id,
    tenantId: data.tenant_id,
    bookId: data.book_id,
    userId: data.user_id,
    cfi: data.cfi,
    label: data.label,
    createdAt: data.created_at,
  };
}

/**
 * Deletes a user bookmark.
 */
export async function removeBookmark(
  bookmarkId: string,
  userId: string
): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin
    .from('bookmarks')
    .delete()
    .eq('id', bookmarkId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to delete bookmark: ${error.message}`);
  }
}
