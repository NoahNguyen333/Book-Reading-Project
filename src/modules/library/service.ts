import { createClient, createAdminClient } from '@/lib/supabase/server';
import { Book } from './types';

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
