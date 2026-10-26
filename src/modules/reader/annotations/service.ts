import { createClient, createAdminClient } from '@/lib/supabase/server';
import { Book } from '@/modules/library/types';
import {
  Annotation,
  AnnotationComment,
  CreateAnnotationInput,
  CreateCommentInput,
  GroupedBookAnnotations,
  HighlightColor,
} from './types';
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
    highlightedText: String(row.selected_text),
    note: row.note ? String(row.note) : null,
    color: (String(row.color) as HighlightColor) || 'yellow',
    isShared: Boolean(row.is_shared),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    book,
  };
}

function mapDbComment(
  row: Record<string, unknown>,
  userMap?: Map<string, { name?: string; email?: string }>
): AnnotationComment {
  const userId = String(row.user_id);
  const userInfo = userMap?.get(userId);
  return {
    id: String(row.id),
    annotationId: String(row.annotation_id),
    tenantId: String(row.tenant_id),
    userId,
    userName: userInfo?.name || (row.user_name ? String(row.user_name) : undefined) || 'Family Member',
    userEmail: userInfo?.email || (row.user_email ? String(row.user_email) : undefined),
    content: String(row.content),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/**
 * Retrieves annotations for a specific book.
 * Includes user's private annotations plus any annotations shared by space members.
 * Supports cross-tenant reading by querying annotations by bookId and user/shared permissions.
 */
export async function getBookAnnotations(
  bookId: string,
  tenantId?: string | null,
  currentUserId?: string
): Promise<Annotation[]> {
  const actualUserId = currentUserId || (tenantId ? tenantId : '');
  const supabase = await createClient();

  // Query annotations: user's own OR shared
  let query = supabase
    .from('annotations')
    .select('*')
    .eq('book_id', bookId);

  if (tenantId && tenantId !== actualUserId) {
    // If a specific tenant is specified, include it or allow cross-tenant personal notes
    query = query.or(`tenant_id.eq.${tenantId},user_id.eq.${actualUserId}`);
  }

  if (actualUserId) {
    query = query.or(`user_id.eq.${actualUserId},is_shared.eq.true`);
  }

  const { data, error } = await query.order('created_at', { ascending: true });

  if (error || !data) {
    const admin = createAdminClient();
    let adminQuery = admin
      .from('annotations')
      .select('*')
      .eq('book_id', bookId);

    if (actualUserId) {
      adminQuery = adminQuery.or(`user_id.eq.${actualUserId},is_shared.eq.true`);
    }

    const { data: adminData } = await adminQuery.order('created_at', { ascending: true });

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

  // Load all highlights belonging to current user (including public books)
  // plus any shared highlights within this family space
  const { data, error } = await supabase
    .from('annotations')
    .select('*, books(*)')
    .or(`user_id.eq.${currentUserId},and(tenant_id.eq.${tenantId},is_shared.eq.true)`)
    .order('created_at', { ascending: false });

  let rows = data;

  if (error || !rows) {
    const admin = createAdminClient();
    const { data: adminData } = await admin
      .from('annotations')
      .select('*, books(*)')
      .or(`user_id.eq.${currentUserId},and(tenant_id.eq.${tenantId},is_shared.eq.true)`)
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
  input: CreateAnnotationInput & {
    userId: string;
    format: 'epub' | 'pdf';
  }
): Promise<Annotation> {
  const supabase = await createClient();

  const insertPayload = {
    tenant_id: input.tenantId,
    book_id: input.bookId,
    user_id: input.userId,
    location: input.location,
    format: input.format,
    selected_text: input.highlightedText,
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
      .select('user_id, tenant_id')
      .eq('id', annotationId)
      .single();

    if (!existing || existing.user_id !== userId) {
      throw new Error('Access denied: You can only delete your own annotations.');
    }

    const { error } = await admin
      .from('annotations')
      .delete()
      .eq('id', annotationId);

    if (error) {
      throw new Error(`Failed to delete annotation: ${error.message}`);
    }
    return;
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

/**
 * Retrieves chronological discussion comments for an annotation within a tenant.
 */
export async function getAnnotationComments(
  annotationId: string,
  tenantId: string
): Promise<AnnotationComment[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('annotation_comments')
    .select('*')
    .eq('annotation_id', annotationId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });

  let rows = data;
  if (error || !rows) {
    const admin = createAdminClient();
    const { data: adminData } = await admin
      .from('annotation_comments')
      .select('*')
      .eq('annotation_id', annotationId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true });

    if (!adminData) return [];
    rows = adminData;
  }

  // Enrich user names
  const userIds = Array.from(new Set(rows.map((r) => String(r.user_id))));
  const userMap = new Map<string, { name?: string; email?: string }>();

  if (userIds.length > 0) {
    const admin = createAdminClient();
    try {
      const { data: usersData } = await admin.auth.admin.listUsers();
      if (usersData?.users) {
        for (const u of usersData.users) {
          if (userIds.includes(u.id)) {
            userMap.set(u.id, {
              name: u.user_metadata?.full_name || u.email?.split('@')[0],
              email: u.email,
            });
          }
        }
      }
    } catch {
      // Graceful fallback if listUsers has permission limitations
    }
  }

  return rows.map((r) => mapDbComment(r as Record<string, unknown>, userMap));
}

/**
 * Posts a reply/comment to an annotation within a tenant.
 */
export async function createComment(
  input: CreateCommentInput & { userId: string; userName?: string; userEmail?: string }
): Promise<AnnotationComment> {
  const clean = input.content.trim();
  if (clean.length === 0 || clean.length > 2000) {
    throw new Error('Comment must be between 1 and 2,000 characters.');
  }

  const supabase = await createClient();
  const insertPayload = {
    annotation_id: input.annotationId,
    tenant_id: input.tenantId,
    user_id: input.userId,
    content: clean,
  };

  const { data, error } = await supabase
    .from('annotation_comments')
    .insert(insertPayload)
    .select('*')
    .single();

  if (error || !data) {
    const admin = createAdminClient();
    const { data: adminData, error: adminErr } = await admin
      .from('annotation_comments')
      .insert(insertPayload)
      .select('*')
      .single();

    if (adminErr || !adminData) {
      throw new Error(`Failed to post comment: ${adminErr?.message || error?.message}`);
    }

    return mapDbComment(
      adminData,
      new Map([[input.userId, { name: input.userName, email: input.userEmail }]])
    );
  }

  return mapDbComment(
    data,
    new Map([[input.userId, { name: input.userName, email: input.userEmail }]])
  );
}

/**
 * Deletes a comment by ID.
 * Authorized for author or tenant admin.
 */
export async function deleteComment(
  commentId: string,
  tenantId: string,
  userId: string,
  isAdmin: boolean
): Promise<void> {
  const admin = createAdminClient();

  if (!isAdmin) {
    const { data: existing } = await admin
      .from('annotation_comments')
      .select('user_id')
      .eq('id', commentId)
      .eq('tenant_id', tenantId)
      .single();

    if (!existing || existing.user_id !== userId) {
      throw new Error('Access denied: You can only delete your own comments.');
    }
  }

  const { error } = await admin
    .from('annotation_comments')
    .delete()
    .eq('id', commentId)
    .eq('tenant_id', tenantId);

  if (error) {
    throw new Error(`Failed to delete comment: ${error.message}`);
  }
}
