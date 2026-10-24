'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser, isPlatformSuperAdmin } from '@/modules/auth';
import { getUserTenants, findTenantRole } from '@/modules/tenant';
import { canUploadBooks } from '@/modules/entitlements';
import { isValidUuid } from '@/lib/validation';
import { validateFileBasics, validateAndExtractMetadata } from './validation';
import { insertBook, deleteBook, logAuditEvent } from './service';
import { createAdminClient } from '@/lib/supabase/server';

export interface BookActionResult {
  success?: boolean;
  error?: string;
  bookId?: string;
}

export interface RegisterUploadedBookInput {
  tenantId: string;
  bookId: string;
  title: string;
  author?: string | null;
  description?: string | null;
  format: string;
  storagePath: string;
  coverPath?: string | null;
  fileSize: number;
  pageCount?: number | null;
}

/**
 * Lightweight Server Action to register a book whose binary has already been
 * uploaded directly from client browser to Supabase Storage.
 * Transmits < 2KB payload, completely bypassing Vercel's 4.5MB Serverless Function ceiling.
 */
export async function registerUploadedBookAction(
  input: RegisterUploadedBookInput
): Promise<BookActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { error: 'Authentication required to register books.' };
    }

    const tenantId = input.tenantId?.trim();
    if (!tenantId || !isValidUuid(tenantId)) {
      return { error: 'Missing or invalid tenant identifier.' };
    }

    // Verify role authorization (or platform super admin)
    const isSuperAdmin = await isPlatformSuperAdmin(user.email);
    const memberships = await getUserTenants(user.id);
    const userRole = findTenantRole(memberships, tenantId);
    if (!isSuperAdmin && !canUploadBooks(userRole)) {
      return { error: 'Access denied: Only space admins are permitted to register books.' };
    }

    const rawTitle = input.title?.trim() || 'Untitled Document';
    const title = rawTitle.slice(0, 255);
    const author = input.author?.trim() ? input.author.trim().slice(0, 255) : null;
    const description = input.description?.trim() ? input.description.trim().slice(0, 2000) : null;
    const format = input.format?.toLowerCase() === 'pdf' ? 'pdf' : 'epub';
    const bookId = (input.bookId && isValidUuid(input.bookId.trim()))
      ? input.bookId.trim()
      : crypto.randomUUID();

    // Guard storage path strictly against traversal and tenant spoofing
    const expectedPrefix = `${tenantId}/`;
    let storagePath = input.storagePath?.trim();
    if (storagePath) {
      if (storagePath.includes('..') || !storagePath.startsWith(expectedPrefix)) {
        return { error: 'Invalid storage path: must reside within the tenant directory.' };
      }
    } else {
      storagePath = `${tenantId}/${bookId}.${format}`;
    }

    // Validate cover path if provided
    let coverPath = input.coverPath?.trim() || null;
    if (coverPath) {
      if (coverPath.includes('..') || (!coverPath.startsWith(expectedPrefix) && !coverPath.startsWith('data:'))) {
        coverPath = null;
      }
    }

    const fileSize = typeof input.fileSize === 'number' && input.fileSize > 0
      ? Math.min(input.fileSize, 52428800)
      : 0;

    // Insert record into database. Only platform Super Admin uploads default to public catalog.
    await insertBook({
      id: bookId,
      tenantId,
      title,
      author,
      description,
      coverUrl: coverPath,
      storagePath,
      fileSize,
      format,
      processingStatus: 'ready',
      isPublic: isSuperAdmin ? true : false,
    });

    // Log Audit Event
    await logAuditEvent(tenantId, user.id, 'BOOK_UPLOADED', {
      bookId,
      title,
      author,
      fileSize,
      format,
    });

    revalidatePath('/dashboard');
    return { success: true, bookId };
  } catch (err) {
    return {
      error: `Failed to register book: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Server action to process an EPUB or PDF upload:
 * - Validates tenant admin authorization
 * - Inspects document container, verifies metadata & integrity
 * - Uploads document and cover assets to private Supabase Storage
 * - Persists record in public.books and emits audit event
 */
export async function uploadBookAction(
  _prevState: BookActionResult | null,
  formData: FormData
): Promise<BookActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { error: 'Authentication required to upload books.' };
    }

    const tenantId = (formData.get('tenantId') as string)?.trim();
    if (!tenantId || !isValidUuid(tenantId)) {
      return { error: 'Missing or invalid tenant identifier.' };
    }

    // Verify role authorization (or platform super admin)
    const isSuperAdmin = await isPlatformSuperAdmin(user.email);
    const memberships = await getUserTenants(user.id);
    const userRole = findTenantRole(memberships, tenantId);
    if (!isSuperAdmin && !canUploadBooks(userRole)) {
      return { error: 'Access denied: Only tenant admins are permitted to upload books.' };
    }

    const file = formData.get('file') as File | null;
    if (!file || !(file instanceof File) || file.size === 0) {
      return { error: 'Please select a valid EPUB or PDF file to upload.' };
    }

    // 1. Basic extension & size check
    const basicValidation = validateFileBasics(file.name, file.size, file.type);
    if (!basicValidation.isValid) {
      return { error: basicValidation.error };
    }

    // 2. Read file buffer & perform document inspection
    const arrayBuffer = await file.arrayBuffer();
    const deepValidation = await validateAndExtractMetadata(file.name, arrayBuffer, file.type);
    if (!deepValidation.isValid || !deepValidation.metadata) {
      return { error: deepValidation.error || 'Document validation failed.' };
    }

    const { metadata } = deepValidation;
    const manualTitle = (formData.get('title') as string)?.trim();
    const manualAuthor = (formData.get('author') as string)?.trim();
    const manualDescription = (formData.get('description') as string)?.trim();
    const clientCoverDataUrl = (formData.get('coverDataUrl') as string)?.trim();

    const title = manualTitle || metadata.title || 'Untitled Document';
    const author = manualAuthor || metadata.author || null;
    const description = manualDescription || metadata.description || null;
    const format = metadata.format || 'epub';

    const bookId = crypto.randomUUID();
    const storagePath = `${tenantId}/${bookId}.${format}`;

    const admin = createAdminClient();

    // 3. Upload document binary to private Supabase storage
    const contentType = format === 'pdf' ? 'application/pdf' : 'application/epub+zip';
    const { error: uploadError } = await admin.storage
      .from('books')
      .upload(storagePath, Buffer.from(arrayBuffer), {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      return { error: `Storage upload failed: ${uploadError.message}` };
    }

    // 4. Handle cover image if present
    let coverUrl: string | null = null;
    if (metadata.coverBuffer) {
      const coverPath = `${tenantId}/${bookId}-cover.jpg`;
      const { error: coverUploadError } = await admin.storage
        .from('books')
        .upload(coverPath, Buffer.from(metadata.coverBuffer), {
          contentType: metadata.coverMediaType || 'image/jpeg',
          upsert: true,
        });

      if (!coverUploadError) {
        coverUrl = coverPath;
      }
    } else if (clientCoverDataUrl) {
      coverUrl = clientCoverDataUrl;
    } else if (metadata.coverDataUrl) {
      coverUrl = metadata.coverDataUrl;
    }

    // 5. Insert record into database. Only platform Super Admin uploads default to public catalog.
    await insertBook({
      tenantId,
      title,
      author,
      description,
      coverUrl,
      storagePath,
      fileSize: file.size,
      format,
      processingStatus: 'ready',
      isPublic: isSuperAdmin ? true : false,
    });

    // 6. Log Audit Event
    await logAuditEvent(tenantId, user.id, 'BOOK_UPLOADED', {
      bookId,
      title,
      author,
      fileSize: file.size,
    });

    revalidatePath('/dashboard');
    return { success: true, bookId };
  } catch (err) {
    return {
      error: `An unexpected error occurred during upload: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Server action to delete a book:
 * Restricted to tenant admins.
 */
export async function deleteBookAction(
  tenantId: string,
  bookId: string
): Promise<BookActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { error: 'Authentication required.' };
    }

    const cleanTenantId = tenantId?.trim();
    const cleanBookId = bookId?.trim();
    if (!cleanTenantId || !cleanBookId || !isValidUuid(cleanTenantId) || !isValidUuid(cleanBookId)) {
      return { error: 'Invalid tenant or book identifier.' };
    }

    const isSuperAdmin = await isPlatformSuperAdmin(user.email);
    const memberships = await getUserTenants(user.id);
    const userRole = findTenantRole(memberships, cleanTenantId);
    if (!isSuperAdmin && !canUploadBooks(userRole)) {
      return { error: 'Access denied: Only tenant admins can delete books.' };
    }

    await deleteBook(cleanTenantId, cleanBookId);

    await logAuditEvent(cleanTenantId, user.id, 'BOOK_DELETED', { bookId: cleanBookId });

    revalidatePath('/dashboard');
    return { success: true };
  } catch (err) {
    return {
      error: `Failed to delete book: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}
