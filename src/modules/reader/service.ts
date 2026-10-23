import { createClient, createAdminClient } from '@/lib/supabase/server';
import { ReadingProgress, Bookmark } from './types';
import { Book } from '@/modules/library/types';

/**
 * Retrieves book details by ID, supporting cross-tenant public catalog reading.
 * Queries strictly by bookId, returning the record and its storage tenant_id.
 */
export async function getBookDetails(
  bookId: string,
  tenantId?: string
): Promise<Book | null> {
  const supabase = await createClient();

  let query = supabase.from('books').select('*').eq('id', bookId);
  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }

  const { data, error } = await query.single();

  if (error || !data) {
    // Fallback to admin client to resolve book across tenants
    const admin = createAdminClient();
    let adminQuery = admin.from('books').select('*').eq('id', bookId);
    if (tenantId) {
      adminQuery = adminQuery.eq('tenant_id', tenantId);
    }
    const { data: adminData, error: adminError } = await adminQuery.single();

    if (adminError || !adminData) {
      // If tenantId was specified and failed, fallback to querying strictly by id
      if (tenantId) {
        const { data: fallbackData } = await admin.from('books').select('*').eq('id', bookId).single();
        if (fallbackData) {
          return {
            id: fallbackData.id,
            tenantId: fallbackData.tenant_id,
            title: fallbackData.title,
            author: fallbackData.author,
            description: fallbackData.description,
            coverUrl: fallbackData.cover_url,
            storagePath: fallbackData.storage_path,
            fileSize: fallbackData.file_size,
            format: fallbackData.format,
            processingStatus: fallbackData.processing_status,
            createdAt: fallbackData.created_at,
            updatedAt: fallbackData.updated_at,
          };
        }
      }
      return null;
    }

    return {
      id: adminData.id,
      tenantId: adminData.tenant_id,
      title: adminData.title,
      author: adminData.author,
      description: adminData.description,
      coverUrl: adminData.cover_url,
      storagePath: adminData.storage_path,
      fileSize: adminData.file_size,
      format: adminData.format,
      processingStatus: adminData.processing_status,
      createdAt: adminData.created_at,
      updatedAt: adminData.updated_at,
    };
  }

  return {
    id: data.id,
    tenantId: data.tenant_id,
    title: data.title,
    author: data.author,
    description: data.description,
    coverUrl: data.cover_url,
    storagePath: data.storage_path,
    fileSize: data.file_size,
    format: data.format,
    processingStatus: data.processing_status,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
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
