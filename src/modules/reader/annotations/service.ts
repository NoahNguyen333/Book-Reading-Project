import { createClient, createAdminClient } from '@/lib/supabase/server';
import { Book } from '@/modules/library/types';
import { Annotation, CreateAnnotationInput, GroupedBookAnnotations, HighlightColor } from './types';
import { groupAnnotationsByBook } from './utils';

function mapDbBook(row: Record<string, unknown>): Book {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    title: String(row.title),
    author: row.author ? String(row.author) : null,
    description: row.description ? String(row.description) : null,
    coverUrl: row.cover_url ? String(row.cover_url) : null,
    storagePath: row.storage_path ? String(row.storage_path) : null,
    fileSize: typeof row.file_size === 'number' ? row.file_size : null,
    format: String(row.format || 'epub'),
    processingStatus: String(row.processing_status || 'ready'),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapDbAnnotation(row: Record<string, unknown>, book?: Book): Annotation {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    bookId: String(row.book_id),
    userId: String(row.user_id),
    location: String(row.location),
    highlightedText: String(row.highlighted_text),
    note: row.note ? String(row.note) : null,
    color: (String(row.color) as HighlightColor) || 'yellow',
    isShared: Boolean(row.is_shared),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    book,
  };
}

/**
 * Retrieves annotations for a specific book inside a tenant.
 * Includes user's private annotations plus any annotations shared by space members.
 */
export async function getBookAnnotations(
  bookId: string,
  tenantId: string,
  currentUserId: string
): Promise<Annotation[]> {
  const supabase = await createClient();

  // Query annotations: user's own OR shared
  const { data, error } = await supabase
    .from('annotations')
    .select('*')
    .eq('book_id', bookId)
    .eq('tenant_id', tenantId)
    .or(`user_id.eq.${currentUserId},is_shared.eq.true`)
    .order('created_at', { ascending: true });

  if (error || !data) {
    const admin = createAdminClient();
    const { data: adminData } = await admin
      .from('annotations')
      .select('*')
      .eq('book_id', bookId)
      .eq('tenant_id', tenantId)
      .or(`user_id.eq.${currentUserId},is_shared.eq.true`)
      .order('created_at', { ascending: true });

    if (!adminData) return [];
    return adminData.map((r) => mapDbAnnotation(r));
  }

  return data.map((r) => mapDbAnnotation(r));
}

/**
 * Retrieves all annotations for a user within a tenant, joined with book metadata,
 * pre-grouped by book.
 */
export async function getGroupedUserAnnotations(
  tenantId: string,
  currentUserId: string
): Promise<GroupedBookAnnotations[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('annotations')
    .select('*, books(*)')
    .eq('tenant_id', tenantId)
    .or(`user_id.eq.${currentUserId},is_shared.eq.true`)
    .order('created_at', { ascending: false });

  let rows = data;

  if (error || !rows) {
    const admin = createAdminClient();
    const { data: adminData } = await admin
      .from('annotations')
      .select('*, books(*)')
      .eq('tenant_id', tenantId)
      .or(`user_id.eq.${currentUserId},is_shared.eq.true`)
      .order('created_at', { ascending: false });

    if (!adminData) return [];
    rows = adminData;
  }

  const annotations: Annotation[] = [];
  const missingBookIds: string[] = [];

  for (const row of rows) {
    const rawBook = Array.isArray(row.books) ? row.books[0] : row.books;
    let book: Book | undefined = undefined;

    if (rawBook && rawBook.id) {
      book = mapDbBook(rawBook as Record<string, unknown>);
    } else if (row.book_id) {
      missingBookIds.push(row.book_id);
    }

    annotations.push(mapDbAnnotation(row as Record<string, unknown>, book));
  }

  // Fallback to fetch missing books if relation wasn't joined
  if (missingBookIds.length > 0) {
    const admin = createAdminClient();
    const { data: booksData } = await admin
      .from('books')
      .select('*')
      .in('id', missingBookIds);

    if (booksData) {
      const bookMap = new Map(booksData.map((b) => [b.id, mapDbBook(b as Record<string, unknown>)]));
      for (const ann of annotations) {
        if (!ann.book) {
          ann.book = bookMap.get(ann.bookId);
        }
      }
    }
  }

  return groupAnnotationsByBook(annotations);
}

/**
 * Persists a new highlight and reflection note.
 */
export async function createAnnotation(
  input: CreateAnnotationInput & { userId: string }
): Promise<Annotation> {
  const supabase = await createClient();

  const insertPayload = {
    tenant_id: input.tenantId,
    book_id: input.bookId,
    user_id: input.userId,
    location: input.location,
    highlighted_text: input.highlightedText,
    note: input.note?.trim() || null,
    color: input.color || 'yellow',
    is_shared: Boolean(input.isShared),
  };

  const { data, error } = await supabase
    .from('annotations')
    .insert(insertPayload)
    .select('*')
    .single();

  if (error || !data) {
    const admin = createAdminClient();
    const { data: adminData, error: adminErr } = await admin
      .from('annotations')
      .insert(insertPayload)
      .select('*')
      .single();

    if (adminErr || !adminData) {
      throw new Error(`Failed to create annotation: ${adminErr?.message || error?.message}`);
    }

    return mapDbAnnotation(adminData);
  }

  return mapDbAnnotation(data);
}

/**
 * Deletes an annotation by ID.
 * Authorized for author or tenant admin.
 */
export async function deleteAnnotation(
  annotationId: string,
  tenantId: string,
  userId: string,
  isAdmin: boolean
): Promise<void> {
  const admin = createAdminClient();

  // If user is not admin, verify ownership
  if (!isAdmin) {
    const { data: existing } = await admin
      .from('annotations')
      .select('user_id')
      .eq('id', annotationId)
      .eq('tenant_id', tenantId)
      .single();

    if (!existing || existing.user_id !== userId) {
      throw new Error('Access denied: You can only delete your own annotations.');
    }
  }

  const { error } = await admin
    .from('annotations')
    .delete()
    .eq('id', annotationId)
    .eq('tenant_id', tenantId);

  if (error) {
    throw new Error(`Failed to delete annotation: ${error.message}`);
  }
}
