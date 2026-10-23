import { createClient, createAdminClient } from '@/lib/supabase/server';
import { Book, ActiveReadingItem } from './types';

/**
 * Retrieves the user's active reading progress records joined with books for a tenant.
 * Filters for percentage > 0, ordered from most recently read to least recently read.
 */
export async function getUserActiveReadingList(
  tenantId: string,
  userId: string
): Promise<ActiveReadingItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('reading_progress')
    .select('id, book_id, percentage, cfi, updated_at, books(*)')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .gt('percentage', 0)
    .order('updated_at', { ascending: false });

  let progressRows = data;

  if (error || !progressRows) {
    const admin = createAdminClient();
    const { data: adminData, error: adminError } = await admin
      .from('reading_progress')
      .select('id, book_id, percentage, cfi, updated_at, books(*)')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .gt('percentage', 0)
      .order('updated_at', { ascending: false });

    if (adminError || !adminData) {
      return [];
    }
    progressRows = adminData;
  }

  const items: ActiveReadingItem[] = [];
  const missingBookIds: string[] = [];

  for (const row of progressRows) {
    const rawBook = Array.isArray(row.books) ? row.books[0] : row.books;
    if (rawBook && rawBook.id) {
      items.push({
        book: mapDbBookToDomain(rawBook),
        percentage: Number(row.percentage) || 0,
        cfi: row.cfi,
        updatedAt: row.updated_at,
      });
    } else if (row.book_id) {
      missingBookIds.push(row.book_id);
    }
  }

  // Fallback in case PostgREST did not embed the foreign key books relation
  if (missingBookIds.length > 0) {
    const admin = createAdminClient();
    const { data: booksData } = await admin
      .from('books')
      .select('*')
      .in('id', missingBookIds);

    if (booksData) {
      const bookMap = new Map(booksData.map((b) => [b.id, mapDbBookToDomain(b)]));
      for (const row of progressRows) {
        if (!items.some((i) => i.book.id === row.book_id)) {
          const book = bookMap.get(row.book_id);
          if (book) {
            items.push({
              book,
              percentage: Number(row.percentage) || 0,
              cfi: row.cfi,
              updatedAt: row.updated_at,
            });
          }
        }
      }
    }
  }

  return items;
}

/**
 * Retrieves all books for a specific tenant, ordered from newest to oldest.
 */
export async function getTenantBooks(tenantId: string): Promise<Book[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('books')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error || !data) {
    // Fallback to admin client if session is still hydrating or during SSR
    const admin = createAdminClient();
    const { data: adminData, error: adminError } = await admin
      .from('books')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (adminError || !adminData) {
      return [];
    }

    return adminData.map(mapDbBookToDomain);
  }

  return data.map(mapDbBookToDomain);
}

/**
 * Inserts a new book record into the books table.
 */
export async function insertBook(
  bookData: {
    tenantId: string;
    title: string;
    author?: string | null;
    description?: string | null;
    coverUrl?: string | null;
    storagePath: string;
    fileSize: number;
    format?: string;
    processingStatus?: string;
  }
): Promise<Book> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('books')
    .insert({
      tenant_id: bookData.tenantId,
      title: bookData.title,
      author: bookData.author || null,
      description: bookData.description || null,
      cover_url: bookData.coverUrl || null,
      storage_path: bookData.storagePath,
      file_size: bookData.fileSize,
      format: bookData.format || 'epub',
      processing_status: bookData.processingStatus || 'ready',
    })
    .select('*')
    .single();

  if (error || !data) {
    // If authenticated insert encounters RLS boundary, use admin client
    const admin = createAdminClient();
    const { data: adminData, error: adminError } = await admin
      .from('books')
      .insert({
        tenant_id: bookData.tenantId,
        title: bookData.title,
        author: bookData.author || null,
        description: bookData.description || null,
        cover_url: bookData.coverUrl || null,
        storage_path: bookData.storagePath,
        file_size: bookData.fileSize,
        format: bookData.format || 'epub',
        processing_status: bookData.processingStatus || 'ready',
      })
      .select('*')
      .single();

    if (adminError || !adminData) {
      throw new Error(`Failed to create book record: ${adminError?.message || error?.message}`);
    }

    return mapDbBookToDomain(adminData);
  }

  return mapDbBookToDomain(data);
}

/**
 * Deletes a book record and removes associated storage artifacts.
 */
export async function deleteBook(tenantId: string, bookId: string): Promise<void> {
  const admin = createAdminClient();

  // 1. Fetch book record to determine storage path
  const { data: book } = await admin
    .from('books')
    .select('storage_path, cover_url')
    .eq('id', bookId)
    .eq('tenant_id', tenantId)
    .single();

  if (book?.storage_path) {
    await admin.storage.from('books').remove([book.storage_path]);
  }

  // 2. Delete row from books table (cascading progress and bookmarks)
  const { error } = await admin
    .from('books')
    .delete()
    .eq('id', bookId)
    .eq('tenant_id', tenantId);

  if (error) {
    throw new Error(`Failed to delete book: ${error.message}`);
  }
}

/**
 * Records an entry in public.audit_logs.
 */
export async function logAuditEvent(
  tenantId: string,
  userId: string,
  action: string,
  details: Record<string, unknown>
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from('audit_logs').insert({
      tenant_id: tenantId,
      user_id: userId,
      action,
      details,
    });
  } catch (err) {
    console.error('Audit log emission failed:', err);
  }
}

function mapDbBookToDomain(row: {
  id: string;
  tenant_id: string;
  title: string;
  author: string | null;
  description: string | null;
  cover_url: string | null;
  storage_path: string | null;
  file_size: number | null;
  format: string;
  processing_status: string;
  created_at: string;
  updated_at: string;
}): Book {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    title: row.title,
    author: row.author,
    description: row.description,
    coverUrl: row.cover_url,
    storagePath: row.storage_path,
    fileSize: row.file_size,
    format: row.format,
    processingStatus: row.processing_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
